// ── BAHAMAS CUSTOMS DUTY RATE ENGINE ──
// Based on official Bahamas Customs frequently imported items schedule
// US/Florida suppliers only — Bahamas suppliers pay 0% duty
// VAT: 10% on (CIF Value + Duty + Fees) — applied separately at checkout
// Processing Fee: 1% (min $10, max $1000) — included in shipping estimate

function getDutyRate(category: string, productName: string): number {
  const name = productName.toLowerCase();
  const cat  = category.toLowerCase();

  // ── SEAFOOD ──
  if (cat === "seafood") {
    // FREE (0%)
    if (name.includes("shrimp"))                                    return 0;
    if (name.includes("salmon"))                                    return 0;
    if (name.includes("octopus"))                                   return 0;
    if (name.includes("tuna") && name.includes("canned"))           return 0;
    if (name.includes("sardine"))                                   return 0;
    if (name.includes("fish") && name.includes("canned"))           return 0;
    if (name.includes("lobster") && name.includes("check"))         return 0; // verify HS code
    // 35%
    if (name.includes("grouper"))                                   return 0.35;
    if (name.includes("snapper"))                                   return 0.35;
    if (name.includes("tuna"))                                      return 0.35;
    if (name.includes("mahi"))                                      return 0.35;
    if (name.includes("swai"))                                      return 0.35;
    if (name.includes("lobster"))                                   return 0.35;
    if (name.includes("mussel"))                                    return 0.35;
    if (name.includes("squid"))                                     return 0.35;
    if (name.includes("crab"))                                      return 0.35;
    if (name.includes("clam"))                                      return 0.35;
    if (name.includes("scallop"))                                   return 0.35;
    if (name.includes("tilapia"))                                   return 0.35;
    if (name.includes("catfish"))                                   return 0.35;
    if (name.includes("flounder"))                                  return 0.35;
    if (name.includes("halibut"))                                   return 0.35;
    if (name.includes("sea bass"))                                  return 0.35;
    if (name.includes("fillet"))                                    return 0.35;
    return 0.35; // default seafood
  }

  // ── POULTRY ──
  if (cat === "poultry") {
    if (name.includes("duck"))                                      return 0.05;
    if (name.includes("turkey") && name.includes("deli"))           return 0;   // deli turkey FREE
    if (name.includes("turkey"))                                    return 0.10;
    if (name.includes("chicken"))                                   return 0.30;
    return 0.10; // general poultry
  }

  // ── MEAT ──
  if (cat === "meat") {
    // FREE
    if (name.includes("beef"))                                      return 0;
    if (name.includes("lamb"))                                      return 0;
    if (name.includes("veal"))                                      return 0;
    if (name.includes("corned beef"))                               return 0;
    if (name.includes("deli") && name.includes("ham"))              return 0;
    if (name.includes("deli") && name.includes("turkey"))           return 0;
    if (name.includes("deli") && name.includes("beef"))             return 0;
    if (name.includes("sausage"))                                   return 0;
    // 10%
    if (name.includes("pork"))                                      return 0.10;
    if (name.includes("deer") || name.includes("venison"))          return 0.10;
    if (name.includes("spareribs") || name.includes("ribs"))        return 0.10;
    if (name.includes("bacon"))                                     return 0.10;
    if (name.includes("ham"))                                       return 0.10;
    return 0.10; // default meat
  }

  // ── AUTO PARTS ──
  if (cat === "auto") {
    if (name.includes("battery") || name.includes("batteries"))     return 0.60;
    if (name.includes("rim") || name.includes("wheel"))             return 0.60;
    if (name.includes("engine"))                                    return 0.60;
    if (name.includes("tire") || name.includes("tyre"))             return 0.25;
    if (name.includes("transmission"))                              return 0.40;
    if (name.includes("motor oil") || name.includes("engine oil"))  return 0.45;
    return 0.60; // default auto parts
  }

  // ── VEHICLES ──
  if (cat === "vehicle") {
    if (name.includes("hybrid"))                                    return 0.10; // min hybrid rate
    if (name.includes("motorcycle") || name.includes("moped"))      return 0.75;
    if (name.includes("boat") || name.includes("pleasure"))         return 0.10;
    if (name.includes("backhoe") || name.includes("heavy"))         return 0.45;
    return 0.45; // default vehicle (1.5–2.0L standard rate)
  }

  // ── GENERAL FOOD & GROCERY ──
  if (cat === "general" || cat === "grocery" || cat === "food") {
    // FREE
    if (name.includes("rice"))                                      return 0;
    if (name.includes("bread"))                                     return 0;
    if (name.includes("cereal"))                                    return 0;
    if (name.includes("pasta") || name.includes("noodle"))          return 0;
    if (name.includes("peanut butter") || name.includes("nut spread")) return 0;
    if (name.includes("mayonnaise") || name.includes("mayo"))       return 0;
    if (name.includes("ketchup"))                                   return 0;
    if (name.includes("cooking oil") || name.includes("coconut oil")) return 0;
    if (name.includes("sugar"))                                     return 0;
    if (name.includes("grits"))                                     return 0;
    if (name.includes("juice") && name.includes("100%"))            return 0;
    if (name.includes("condensed milk"))                            return 0;
    if (name.includes("canned soup") || name.includes("soup"))      return 0;
    if (name.includes("tea"))                                       return 0;
    if (name.includes("coffee"))                                    return 0;
    if (name.includes("detergent") || name.includes("soap"))        return 0;
    if (name.includes("toothpaste") || name.includes("toothbrush")) return 0;
    if (name.includes("vitamin") || name.includes("supplement"))    return 0;
    if (name.includes("medicine") || name.includes("medical"))      return 0;
    if (name.includes("insecticide") || name.includes("pesticide")) return 0;
    if (name.includes("fertilizer"))                                return 0;
    if (name.includes("lumber") || name.includes("plywood"))        return 0;
    if (name.includes("led") || name.includes("led light"))         return 0;
    if (name.includes("deodorant"))                                 return 0;
    // 5%
    if (name.includes("air condition") && name.includes("regular")) return 0.05;
    if (name.includes("dryer"))                                     return 0.05;
    if (name.includes("freezer"))                                   return 0.05;
    if (name.includes("generator"))                                 return 0.05;
    if (name.includes("washer"))                                    return 0.05;
    if (name.includes("stove"))                                     return 0.05;
    if (name.includes("refrigerator"))                              return 0.05;
    if (name.includes("copy paper"))                                return 0.05;
    // 10%
    if (name.includes("phone") || name.includes("cellular"))        return 0.10;
    // 20%
    if (name.includes("biscuit") || name.includes("cookie"))        return 0.20;
    if (name.includes("cake") || name.includes("pastry"))           return 0.20;
    if (name.includes("ice cream"))                                 return 0.20;
    if (name.includes("clothing") || name.includes("apparel"))      return 0.20;
    if (name.includes("shoe") || name.includes("slipper"))          return 0.20;
    if (name.includes("sock"))                                      return 0.20;
    if (name.includes("toy"))                                       return 0.20;
    if (name.includes("lock"))                                      return 0.20;
    // 25%
    if (name.includes("furniture"))                                 return 0.25;
    if (name.includes("garbage bag"))                               return 0.25;
    if (name.includes("pots") || name.includes("pans"))             return 0.25;
    if (name.includes("toilet paper") || name.includes("tissue"))   return 0.25;
    if (name.includes("shampoo"))                                   return 0.25;
    if (name.includes("hair"))                                      return 0.25;
    if (name.includes("tile"))                                      return 0.30;
    if (name.includes("tyre") || name.includes("tire"))             return 0.25;
    if (name.includes("paint"))                                     return 0.35;
    // 30%
    if (name.includes("aluminum foil"))                             return 0.30;
    if (name.includes("curtain"))                                   return 0.30;
    if (name.includes("towel"))                                     return 0.30;
    // 35%
    if (name.includes("blender"))                                   return 0.35;
    if (name.includes("microwave"))                                 return 0.35;
    if (name.includes("oven"))                                      return 0.35;
    if (name.includes("television") || name.includes("tv"))         return 0.35;
    if (name.includes("radio"))                                     return 0.35;
    if (name.includes("makeup") || name.includes("cosmetic"))       return 0.35;
    if (name.includes("lawn mower"))                                return 0.35;
    if (name.includes("ipod"))                                      return 0.35;
    // 45%
    if (name.includes("air freshener"))                             return 0.45;
    if (name.includes("amplifier"))                                 return 0.45;
    if (name.includes("carpet") || name.includes("rug"))            return 0.45;
    if (name.includes("broom"))                                     return 0.45;
    if (name.includes("dish") || name.includes("ceramic"))          return 0.45;
    if (name.includes("degreaser"))                                 return 0.45;
    if (name.includes("firework"))                                  return 0.45;
    if (name.includes("garden hose"))                               return 0.45;
    if (name.includes("glassware") || name.includes("glass"))       return 0.45;
    if (name.includes("hat"))                                       return 0.45;
    if (name.includes("pillow"))                                    return 0.45;
    if (name.includes("plastic"))                                   return 0.45;
    if (name.includes("motor oil") || name.includes("body oil"))    return 0.45;
    if (name.includes("video game"))                                return 0.45;
    // 55%
    if (name.includes("energy drink"))                              return 0.55;
    // 60%
    if (name.includes("candy") || name.includes("sweets"))          return 0.60;
    if (name.includes("plastic bag") || name.includes("shopping bag")) return 0.60;
    if (name.includes("mattress"))                                  return 0.60;
    // Alcohol — flat rates (return average %)
    if (name.includes("beer"))                                      return 0.10; // approx
    if (name.includes("wine"))                                      return 0.50;
    if (name.includes("rum") || name.includes("spirits") || name.includes("alcohol")) return 0.50;
    // Tobacco
    if (name.includes("cigarette"))                                 return 0.50; // approx
    if (name.includes("cigar"))                                     return 2.20;
    return 0.25; // default general
  }

  // ── ELECTRONICS ──
  if (cat === "electronics") {
    if (name.includes("computer") || name.includes("laptop") || name.includes("monitor") || name.includes("printer")) return 0;
    if (name.includes("ipad") || name.includes("tablet"))           return 0;
    if (name.includes("camera") || name.includes("camcorder"))      return 0;
    if (name.includes("drone"))                                     return 0;
    if (name.includes("ebook"))                                     return 0;
    if (name.includes("solar"))                                     return 0;
    if (name.includes("phone") || name.includes("cellular"))        return 0.10;
    if (name.includes("ipod"))                                      return 0.35;
    if (name.includes("television") || name.includes("tv"))         return 0.35;
    if (name.includes("amplifier") || name.includes("speaker"))     return 0.45;
    if (name.includes("video game"))                                return 0.45;
    return 0.35;
  }

  // ── BABY ITEMS ──
  if (cat === "baby") {
    return 0; // all baby items FREE
  }

  // ── MEDICAL / HEALTH ──
  if (cat === "medical" || cat === "health") {
    return 0; // medicine, medical supplies, hearing aids, insulin, etc FREE
  }

  return 0.25; // default fallback
}
