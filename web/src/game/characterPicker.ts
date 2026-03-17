/** Agent character pool — 139 NPC spines, used for both world map and battle. */
const ALL_CHARACTERS = [
  "npc_1", "npc_2", "npc_3", "npc_4", "npc_7", "npc_8", "npc_9", "npc_10",
  "npc_11", "npc_12", "npc_13", "npc_14", "npc_15", "npc_16", "npc_17",
  "npc_18", "npc_20", "npc_21", "npc_22", "npc_23", "npc_24", "npc_25",
  "npc_26", "npc_27", "npc_28", "npc_29", "npc_30", "npc_31", "npc_32",
  "npc_33", "npc_34", "npc_36", "npc_37", "npc_38", "npc_42", "npc_43",
  "npc_44", "npc_46", "npc_47", "npc_48", "npc_49", "npc_51", "npc_52",
  "npc_53", "npc_54", "npc_56", "npc_59", "npc_60", "npc_62", "npc_63",
  "npc_68", "npc_84", "npc_85", "npc_86", "npc_87", "npc_88", "npc_303",
  "npc_304", "npc_1000003", "npc_1000004", "npc_1000006", "npc_1000007",
  "npc_1000008", "npc_1000019", "npc_1000027", "npc_1000029", "npc_1000035",
  "npc_1000038", "npc_1000039", "npc_1000040", "npc_1000042", "npc_1000043",
  "npc_1000049", "npc_1000054", "npc_1000056", "npc_1000058", "npc_1000062",
  "npc_1000065", "npc_1000066", "npc_1000068", "npc_1000069", "npc_1000070",
  "npc_1000073", "npc_1000090", "npc_1000103", "npc_1000133", "npc_1000134",
  "npc_1000137", "npc_1000152", "npc_1000168", "npc_1000169", "npc_1000189",
  "npc_1000191", "npc_1000192", "npc_1000193", "npc_1000194", "npc_1000196",
  "npc_1000197", "npc_1000198", "npc_1000199", "npc_1000200", "npc_1000201",
  "npc_1000202", "npc_1000203", "npc_1000204", "npc_1000205", "npc_1000206",
  "npc_1000207", "npc_1000208", "npc_1000209", "npc_1000210", "npc_1000211",
  "npc_1000212", "npc_1000213", "npc_1000214", "npc_1000215", "npc_1000216",
  "npc_1000217", "npc_1000218", "npc_1000219", "npc_1000220", "npc_1000222",
  "npc_1000223", "npc_1000224", "npc_1000225", "npc_1000226", "npc_1000227",
  "npc_1000228", "npc_1000230", "npc_1000231", "npc_1000232", "npc_1000233",
  "npc_1000234", "npc_1000235", "npc_1000236", "npc_1000237", "npc_1000238",
  "npc_1000239", "npc_1000240", "npc_1000241", "npc_1000242", "npc_2000099",
];

/** Per-address character overrides (address prefix → character key). */
const CHARACTER_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ["0x928b", "npc_5"],
]);

/** Pick Spine character ID for an agent based on its wallet address. */
export function pickCharacterId(address: string): string {
  for (const [prefix, charId] of CHARACTER_OVERRIDES) {
    if (address.toLowerCase().startsWith(prefix)) return charId;
  }
  return ALL_CHARACTERS[parseInt(address.slice(-4), 16) % ALL_CHARACTERS.length];
}
