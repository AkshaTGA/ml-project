// Known setup values are stored in English and shown in the app language.
// Anything the user typed that is not in this map stays exactly as entered.
export const VALUE_KEY = {
  farmer: 'roleFarmer', herder: 'roleHerder', mixed: 'roleMixed', agribusiness: 'roleBusiness', student: 'roleStudent',
  acre: 'unitAcre', bigha: 'unitBigha', hectare: 'unitHectare',
  Rainfed: 'irrRainfed', Canal: 'irrCanal', 'Borewell / tubewell': 'irrBorewell', Drip: 'irrDrip', Sprinkler: 'irrSprinkler', 'Pond / tank': 'irrPond',
  Alluvial: 'soilAlluvial', 'Black (cotton)': 'soilBlack', Red: 'soilRed', Laterite: 'soilLaterite', Sandy: 'soilSandy', Clay: 'soilClay', Loamy: 'soilLoamy', "Don't know": 'soilUnknown',
  Wheat: 'cropWheat', Rice: 'cropRice', Maize: 'cropMaize', Cotton: 'cropCotton', Sugarcane: 'cropSugarcane', Soybean: 'cropSoybean',
  Mustard: 'cropMustard', Chickpea: 'cropChickpea', Onion: 'cropOnion', Tomato: 'cropTomato', Potato: 'cropPotato', Banana: 'cropBanana',
  Mango: 'cropMango', Vegetables: 'cropVegetables', Millets: 'cropMillets', Groundnut: 'cropGroundnut', 'Pasture / fodder': 'cropPasture', Fruits: 'cropFruits',
  cows: 'animalCows', buffaloes: 'animalBuffaloes', goats: 'animalGoats', sheep: 'animalSheep', poultry: 'animalPoultry',
}

export function knownText(value, t) {
  if (value == null) return value
  const key = VALUE_KEY[value]
  return key ? t(key) : value
}
