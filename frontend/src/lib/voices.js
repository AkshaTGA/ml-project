// Bulbul v3 speakers. These short names work in all 11 languages the app can speak.
// https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices
export const DEFAULT_VOICE = 'shubh'

export const VOICES = [
  { id: 'shubh', name: 'Shubh', gender: 'male', note: 'defaultVoice' },
  { id: 'aditya', name: 'Aditya', gender: 'male' },
  { id: 'rahul', name: 'Rahul', gender: 'male' },
  { id: 'rohan', name: 'Rohan', gender: 'male' },
  { id: 'amit', name: 'Amit', gender: 'male' },
  { id: 'dev', name: 'Dev', gender: 'male' },
  { id: 'ratan', name: 'Ratan', gender: 'male' },
  { id: 'kabir', name: 'Kabir', gender: 'male' },
  { id: 'aayan', name: 'Aayan', gender: 'male' },
  { id: 'ashutosh', name: 'Ashutosh', gender: 'male' },
  { id: 'advait', name: 'Advait', gender: 'male' },
  { id: 'anand', name: 'Anand', gender: 'male' },
  { id: 'tarun', name: 'Tarun', gender: 'male' },
  { id: 'sunny', name: 'Sunny', gender: 'male' },
  { id: 'mani', name: 'Mani', gender: 'male' },
  { id: 'gokul', name: 'Gokul', gender: 'male' },
  { id: 'vijay', name: 'Vijay', gender: 'male' },
  { id: 'mohit', name: 'Mohit', gender: 'male' },
  { id: 'rehan', name: 'Rehan', gender: 'male' },
  { id: 'soham', name: 'Soham', gender: 'male' },
  { id: 'manan', name: 'Manan', gender: 'male' },
  { id: 'sumit', name: 'Sumit', gender: 'male' },
  { id: 'varun', name: 'Varun', gender: 'male', note: 'dramaticVoice' },
  { id: 'ishita', name: 'Ishita', gender: 'female' },
  { id: 'priya', name: 'Priya', gender: 'female' },
  { id: 'ritu', name: 'Ritu', gender: 'female' },
  { id: 'neha', name: 'Neha', gender: 'female' },
  { id: 'pooja', name: 'Pooja', gender: 'female' },
  { id: 'simran', name: 'Simran', gender: 'female' },
  { id: 'kavya', name: 'Kavya', gender: 'female' },
  { id: 'shreya', name: 'Shreya', gender: 'female' },
  { id: 'roopa', name: 'Roopa', gender: 'female' },
  { id: 'tanya', name: 'Tanya', gender: 'female' },
  { id: 'shruti', name: 'Shruti', gender: 'female' },
  { id: 'suhani', name: 'Suhani', gender: 'female' },
  { id: 'kavitha', name: 'Kavitha', gender: 'female' },
  { id: 'rupali', name: 'Rupali', gender: 'female' },
]

const IDS = new Set(VOICES.map((v) => v.id))

export function voiceSettings(profile) {
  const raw = profile?.voice_settings
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {} } catch { return {} }
  }
  return raw
}

export function voiceId(profile, key) {
  const id = voiceSettings(profile)[key]
  return IDS.has(id) ? id : DEFAULT_VOICE
}
