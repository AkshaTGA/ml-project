"""LangGraph agent: load_context -> agent <-> tools.

Memory reflection runs after the answer, in the background (see routers/chat.py), so it never adds latency.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from . import files, memory, profiles
from .config import LLM_VISION
from .llm import main_llm
from .tools import TOOLS

HISTORY_MESSAGES = 24  # recent messages sent verbatim; older turns are covered by the thread summary

# Fixed part first so the provider's prompt cache can reuse it across turns.
BASE_PROMPT = """You are AgriAssist, a warm, practical AI agronomist and veterinary helper for Indian farmers \
and herders.

You help with crops, soil, fertiliser, pests and diseases, pasture and grazing, livestock care, \
weather-based planning, mandi prices, government schemes and farm business.

How to answer:
- Always reply in the language and script of the user's LATEST message (English -> English, Hindi -> Hindi, \
Hinglish -> Hinglish, Marathi, Tamil, Punjabi, etc.). Use the profile's preferred language only when the \
message has no clear language (e.g. just a photo or a number).
- Be concrete and local: quantities per acre/bigha, timings, doses, step-by-step actions, costs in Rs. \
Prefer short answers with markdown (bold key numbers, short lists, small tables).
- Personalise using the profile, memories and past conversations below. Never ask for information you \
already have.
- Use tools instead of guessing. Call independent tools in parallel (e.g. weather + mandi prices).
  * Photo of leaf/plant/fruit -> diagnose_plant_disease. Photo of pasture/grass -> predict_pasture_biomass, \
then offer estimate_grazing_days for the user's herd.
  * What to grow -> recommend_crop (fill climate with get_weather). Sick animal -> assess_livestock_health.
  * Weather-sensitive advice (sowing, spraying, irrigation, harvest) -> get_weather first.
  * Prices -> get_mandi_prices. Schemes, news, anything current or uncertain -> web_search and cite URLs.
  * When the user shares a lasting fact (new animal, field size, problem, preference) -> remember_fact; \
if their farm details change -> update_farm_profile. Earlier chats -> search_past_conversations.
- Results with "mode": "mock" are sample values from a model that is not connected yet: say so briefly.
- Safety first: for serious animal illness, pesticide handling or human health, also advise a local \
veterinarian / KVK / agriculture officer. Never recommend banned pesticides. Never invent prices or schemes.
- Uploaded files appear in the user's message with a file_id. Look at images yourself too."""

VOICE_PROMPT = """The user is speaking by voice and will hear your answer read aloud: answer in 2-4 short \
spoken sentences, no tables, no markdown, no URLs, numbers written plainly."""

# Shown only when the user turns on detailed steps in Settings.
VERBOSE_PROMPT = """Before calling tools, write one short sentence saying what you are going to check."""

# Default. The chat stream also hides memories, tool arguments and reasoning.
SIMPLE_PROMPT = """This person wants a simple answer they can use in the field.
- Do not announce your plan, name your tools, or mention memory or reasoning. Call tools directly, then answer.
- Use short sentences and everyday words. If you must use a technical word, say what it means.
- Start with what to do today, then the reason, then the dose, timing or cost when you know it."""


# Generative UI. Rendered by frontend/src/components/chat/UIBlocks.jsx; keep the two in sync.
UI_PROMPT = """Visual answers: besides markdown you can add interactive visuals by writing a fenced code block \
with the language `ui` containing ONE JSON object (or a JSON array of objects). You decide when to use them: \
reach for one whenever numbers, a plan, options or a calculation would be easier to grasp visually than as text \
(most practical answers have one), but skip them for greetings, quick facts and short follow-ups. Usually 1-2 per \
answer, never more than 3, each with a short text explanation, and never the same information twice. \
The JSON must be valid (double quotes, no comments, no trailing commas). Write all labels in the user's language. \
Only use numbers you know (from tools, the profile or standard agronomy); never invent prices or measurements.

Available blocks:
- chart: trends, comparisons, shares. kind = bar | line | area | pie | donut. `x` is the label key.
  {"type":"chart","kind":"bar","title":"Rain next 7 days","x":"day","unit":"mm","series":[{"key":"rain","label":"Rain"}],"data":[{"day":"Mon","rain":2},{"day":"Tue","rain":14}]}
- stats: 2-4 key numbers. tone = success | warning | danger | info (optional), trend = up | down (optional).
  {"type":"stats","items":[{"label":"Modal price","value":"3,921","unit":"Rs/qtl","trend":"up"},{"label":"Rain this week","value":"0","unit":"mm","tone":"success"}]}
- steps: an ordered action plan. {"type":"steps","title":"Spray plan","items":[{"title":"Mix neem oil","detail":"5 ml per litre","when":"Today evening"}]}
- schedule: dated tasks (ISO dates). {"type":"schedule","title":"Next 3 weeks","items":[{"date":"2026-11-20","task":"First irrigation","detail":"21 days after sowing","tag":"Water"}]}
- checklist: things to do or check; the user can tick them off. {"type":"checklist","title":"Before spraying","items":["Wear gloves and mask","No rain for 24 hours"]}
- compare: 2-4 options side by side; mark the recommended one with "best": true.
  {"type":"compare","title":"Options","options":[{"name":"Drip","cost":"Rs 45,000/acre","best":true,"badge":"Saves water","metrics":{"Water saved":"40-60%"},"pros":["Less weeds"],"cons":["High upfront cost"]}]}
- callout: one important warning or tip. tone = warning | danger | info | success | tip. {"type":"callout","tone":"warning","title":"Do not spray today","text":"Rain expected tomorrow will wash it off."}
- tips: short tips with an emoji each. {"type":"tips","title":"Save water","items":[{"icon":"💧","title":"Mulch","text":"Keeps soil moist 2x longer"}]}
- calculator: when the answer depends on the user's own numbers (area, animals, dose). Inputs are sliders; outputs are \
formulas over input keys using + - * / ^ ( ) and round/ceil/floor/min/max. Pre-fill defaults from the profile.
  {"type":"calculator","title":"Urea needed","inputs":[{"key":"area","label":"Field area","unit":"acre","default":2,"min":0.5,"max":20,"step":0.5},{"key":"dose","label":"Dose","unit":"kg/acre","default":50,"min":0,"max":150}],"outputs":[{"label":"Total urea","formula":"area*dose","unit":"kg"},{"label":"45 kg bags","formula":"ceil(area*dose/45)","unit":"bags","decimals":0}]}
- gauge: one reading against good/bad ranges (soil pH, moisture, temperature, a risk score). Zones ascend by "to"; tone = good | ok | bad.
  {"type":"gauge","label":"Soil pH","value":8.1,"min":4,"max":10,"zones":[{"to":5.5,"tone":"bad","label":"Acidic"},{"to":7.5,"tone":"good","label":"Ideal"},{"to":10,"tone":"bad","label":"Alkaline"}]}
- choices: ask ONE clarifying question with tappable answers instead of a long text question. Put it last.
  {"type":"choices","question":"Which crop stage?","options":["Seedling","Flowering","Grain filling"]}

Good fits: weather or price data -> chart or stats; a plan -> steps or schedule; doses that scale with area or herd \
size -> calculator; choosing between methods, crops or products -> compare; safety -> callout; missing info -> choices."""

class AgentState(MessagesState):
    context: dict[str, Any]


def system_prompt(context: dict, voice: bool, verbose: bool = False) -> str:
    profile = context.get("profile") or {}
    parts = [BASE_PROMPT, VERBOSE_PROMPT if verbose else SIMPLE_PROMPT]
    parts.append(VOICE_PROMPT if voice else UI_PROMPT)
    if instructions := (profile.get("custom_instructions") or "").strip():
        parts.append("The user's personal style preferences (follow them for tone, format and language, "
                     "but never at the cost of safety or correct tool use):\n" + instructions)
    parts.append(f"Today is {date.today().isoformat()}.")
    parts.append("User's farm profile:\n" + profiles.describe(profile))
    if context.get("memories"):
        parts.append("Things you remember about the user:\n" + "\n".join(f"- {m['text']}" for m in context["memories"]))
    if context.get("recent_threads"):
        parts.append("The user's recent other conversations:\n" + "\n".join(
            f"- {t['title']}: {t['summary']}" for t in context["recent_threads"]))
    if context.get("thread_summary"):
        parts.append("Summary of this conversation so far: " + context["thread_summary"])
    return "\n\n".join(parts)


def trim_history(messages: list) -> list:
    """Last HISTORY_MESSAGES messages, starting at a user message so no tool result is orphaned."""
    recent = messages[-HISTORY_MESSAGES:]
    for i, message in enumerate(recent):
        if isinstance(message, HumanMessage):
            return recent[i:]
    return recent


async def report_tool_result(request, execute):
    """Streams each tool's result the moment it finishes, even while parallel tools are still running."""
    result = await execute(request)
    content = getattr(result, "content", None)
    if content is not None:
        get_stream_writer()({"type": "tool_end", "id": request.tool_call["id"], "name": request.tool_call["name"],
                             "output": content})
    return result


def after_agent(state: AgentState):
    """Run tools if the agent asked for them. An empty history (a chat rewound to the start) just ends."""
    return tools_condition(state) if state["messages"] else END


def build_graph(checkpointer, store, llm=None):
    llm_with_tools = (llm or main_llm()).bind_tools(TOOLS)

    async def load_context(state: AgentState, config: RunnableConfig):
        configurable = config["configurable"]
        latest = state["messages"][-1]
        query = latest.additional_kwargs.get("display_text") or (
            latest.content if isinstance(latest.content, str) else "")
        context = await memory.load_context(configurable["user_id"], configurable["thread_id"], query)
        return {"context": context}

    async def agent(state: AgentState, config: RunnableConfig):
        configurable = config["configurable"]
        prompt = system_prompt(state.get("context") or {}, configurable.get("voice", False), bool(configurable.get("verbose", False)))
        response = await llm_with_tools.ainvoke([SystemMessage(prompt), *trim_history(state["messages"])])
        return {"messages": [response]}

    graph = StateGraph(AgentState)
    graph.add_node("load_context", load_context)
    graph.add_node("agent", agent)
    graph.add_node("tools", ToolNode(TOOLS, awrap_tool_call=report_tool_result))
    graph.add_edge(START, "load_context")
    graph.add_edge("load_context", "agent")
    graph.add_conditional_edges("agent", after_agent, ["tools", END])
    graph.add_edge("tools", "agent")
    return graph.compile(checkpointer=checkpointer, store=store)


async def build_user_message(user_id: str, text: str, attachment_ids: list[str]) -> HumanMessage:
    """Turn the user's text plus uploaded files into a (multimodal) message."""
    notes, images = [], []
    for meta in await files.get_many(user_id, attachment_ids):
        if meta["kind"] == "image":
            notes.append(f"[Attached image '{meta['name']}', file_id={meta['id']}]")
            if LLM_VISION:
                images.append({"type": "image_url", "image_url": {"url": await files.image_data_url(meta)}})
        else:
            notes.append(f"[Attached document '{meta['name']}', file_id={meta['id']}]\n"
                         f"<document>\n{await files.extract_text(meta)}\n</document>")
    body = "\n\n".join(filter(None, [text.strip(), *notes])) or "(no text)"
    content = body if not images else [{"type": "text", "text": body}, *images]
    return HumanMessage(content=content, additional_kwargs={"display_text": text, "attachments": attachment_ids})
