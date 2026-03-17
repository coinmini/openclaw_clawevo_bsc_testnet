import {
  onchainTable,
  onchainEnum,
  relations,
  index,
  primaryKey,
} from "ponder";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const challengeStatus = onchainEnum("challenge_status", [
  "Open",
  "Settled",
  "Cancelled",
]);

export const orderStatus = onchainEnum("order_status", [
  "Active",
  "Cancelled",
  "Filled",
]);

export const caveTier = onchainEnum("cave_tier", [
  "None",
  "CaveHeaven",
  "BlessedLand",
  "SpiritLand",
]);

export const sectWarStatus = onchainEnum("sect_war_status", [
  "Pending",
  "Accepted",
  "Settled",
  "Rejected",
]);

// ---------------------------------------------------------------------------
// 1. Player (mutable)
// ---------------------------------------------------------------------------

export const player = onchainTable(
  "player",
  (t) => ({
    id: t.hex().primaryKey(),
    origin: t.integer().notNull().default(0),
    element: t.integer().notNull().default(0),
    attack: t.bigint().notNull().default(0n),
    defense: t.bigint().notNull().default(0n),
    perception: t.bigint().notNull().default(0n),
    wisdom: t.bigint().notNull().default(0n),
    realm: t.integer().notNull().default(0),
    registeredAt: t.bigint().notNull().default(0n),
    registeredBlock: t.bigint().notNull().default(0n),
    totalMatchesPlayed: t.integer().notNull().default(0),
    totalMatchesWon: t.integer().notNull().default(0),
    totalMatchesLost: t.integer().notNull().default(0),
    totalWagerWon: t.bigint().notNull().default(0n),
    totalWagerLost: t.bigint().notNull().default(0n),
    totalHunts: t.integer().notNull().default(0),
    totalHuntsWon: t.integer().notNull().default(0),
    totalTreasures: t.integer().notNull().default(0),
    totalCultivationSessions: t.integer().notNull().default(0),
  }),
);

export const playerRelations = relations(player, ({ many }) => ({
  challenges: many(challenge),
  matches: many(battleMatch),
  orders: many(marketOrder),
  cultivationSessions: many(cultivationSession),
  breakthroughs: many(breakthroughEvent),
  hunts: many(huntEvent),
  treasures: many(treasureEvent),
  equipmentOwned: many(equipmentToken),
  beastsOwned: many(beastToken),
  secretRealmRuns: many(secretRealmRun),
  beastHunts: many(beastHuntEvent),
}));

// ---------------------------------------------------------------------------
// 2. Challenge (mutable)
// ---------------------------------------------------------------------------

export const challenge = onchainTable(
  "challenge",
  (t) => ({
    id: t.text().primaryKey(),
    challengeId: t.bigint().notNull(),
    creatorAddress: t.hex().notNull(),
    wager: t.bigint().notNull().default(0n),
    status: challengeStatus("status").notNull().default("Open"),
    createdAt: t.bigint().notNull().default(0n),
    createdBlock: t.bigint().notNull().default(0n),
    cancelledAt: t.bigint(),
    settledAt: t.bigint(),
    matchId: t.text(),
  }),
  (table) => ({
    creatorIdx: index().on(table.creatorAddress),
    statusIdx: index().on(table.status),
  }),
);

export const challengeRelations = relations(challenge, ({ one }) => ({
  creator: one(player, {
    fields: [challenge.creatorAddress],
    references: [player.id],
  }),
}));

// ---------------------------------------------------------------------------
// 3. BattleMatch (immutable event)
// ---------------------------------------------------------------------------

export const battleMatch = onchainTable(
  "battle_match",
  (t) => ({
    id: t.text().primaryKey(),
    matchId: t.bigint().notNull(),
    challengeId: t.bigint().notNull(),
    challengeRef: t.text().notNull(),
    playerAAddress: t.hex().notNull(),
    playerBAddress: t.hex().notNull(),
    winner: t.hex().notNull(),
    payout: t.bigint().notNull(),
    settledAt: t.bigint().notNull(),
    settledBlock: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    playerAIdx: index().on(table.playerAAddress),
    playerBIdx: index().on(table.playerBAddress),
    challengeRefIdx: index().on(table.challengeRef),
  }),
);

export const battleMatchRelations = relations(battleMatch, ({ one }) => ({
  playerA: one(player, {
    fields: [battleMatch.playerAAddress],
    references: [player.id],
  }),
  playerB: one(player, {
    fields: [battleMatch.playerBAddress],
    references: [player.id],
  }),
  challenge: one(challenge, {
    fields: [battleMatch.challengeRef],
    references: [challenge.id],
  }),
}));

// ---------------------------------------------------------------------------
// 4. PlayerDailyStats (mutable, composite PK)
// ---------------------------------------------------------------------------

export const playerDailyStats = onchainTable(
  "player_daily_stats",
  (t) => ({
    playerAddress: t.hex().notNull(),
    dayId: t.integer().notNull(),
    matchesPlayed: t.integer().notNull().default(0),
    matchesWon: t.integer().notNull().default(0),
    wagerWon: t.bigint().notNull().default(0n),
    wagerLost: t.bigint().notNull().default(0n),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.playerAddress, table.dayId] }),
    playerIdx: index().on(table.playerAddress),
  }),
);

export const playerDailyStatsRelations = relations(
  playerDailyStats,
  ({ one }) => ({
    player: one(player, {
      fields: [playerDailyStats.playerAddress],
      references: [player.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// 5. MarketOrder (mutable)
// ---------------------------------------------------------------------------

export const marketOrder = onchainTable(
  "market_order",
  (t) => ({
    id: t.text().primaryKey(),
    orderId: t.bigint().notNull(),
    sellerAddress: t.hex().notNull(),
    tokenContract: t.hex().notNull(),
    tokenId: t.bigint().notNull(),
    price: t.bigint().notNull(),
    isERC1155: t.boolean().notNull().default(false),
    amount: t.bigint(),
    status: orderStatus("status").notNull().default("Active"),
    createdAt: t.bigint().notNull().default(0n),
    createdBlock: t.bigint().notNull().default(0n),
    cancelledAt: t.bigint(),
    filledAt: t.bigint(),
    buyer: t.hex(),
    fee: t.bigint(),
  }),
  (table) => ({
    sellerIdx: index().on(table.sellerAddress),
    statusIdx: index().on(table.status),
    tokenContractIdx: index().on(table.tokenContract),
  }),
);

export const marketOrderRelations = relations(marketOrder, ({ one }) => ({
  seller: one(player, {
    fields: [marketOrder.sellerAddress],
    references: [player.id],
  }),
}));

// ---------------------------------------------------------------------------
// 6. AllowedToken (mutable)
// ---------------------------------------------------------------------------

export const allowedToken = onchainTable("allowed_token", (t) => ({
  id: t.hex().primaryKey(),
  allowed: t.boolean().notNull().default(false),
  updatedAt: t.bigint().notNull().default(0n),
}));

// ---------------------------------------------------------------------------
// 7. CultivationSession (immutable)
// ---------------------------------------------------------------------------

export const cultivationSession = onchainTable(
  "cultivation_session",
  (t) => ({
    id: t.text().primaryKey(),
    playerAddress: t.hex().notNull(),
    duration: t.bigint().notNull(),
    lsEarned: t.bigint().notNull(),
    lsFee: t.bigint().notNull(),
    expGained: t.bigint().notNull(),
    heartGained: t.bigint().notNull(),
    fortuneGained: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
  }),
  (table) => ({
    playerIdx: index().on(table.playerAddress),
  }),
);

export const cultivationSessionRelations = relations(
  cultivationSession,
  ({ one }) => ({
    player: one(player, {
      fields: [cultivationSession.playerAddress],
      references: [player.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// 8. BreakthroughEvent (immutable)
// ---------------------------------------------------------------------------

export const breakthroughEvent = onchainTable(
  "breakthrough_event",
  (t) => ({
    id: t.text().primaryKey(),
    playerAddress: t.hex().notNull(),
    fromRealm: t.integer().notNull(),
    toRealm: t.integer().notNull(),
    success: t.boolean().notNull(),
    timestamp: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
  }),
  (table) => ({
    playerIdx: index().on(table.playerAddress),
  }),
);

export const breakthroughEventRelations = relations(
  breakthroughEvent,
  ({ one }) => ({
    player: one(player, {
      fields: [breakthroughEvent.playerAddress],
      references: [player.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// 9. HuntEvent (immutable)
// ---------------------------------------------------------------------------

export const huntEvent = onchainTable(
  "hunt_event",
  (t) => ({
    id: t.text().primaryKey(),
    playerAddress: t.hex().notNull(),
    regionId: t.integer().notNull(),
    won: t.boolean().notNull(),
    playerScore: t.bigint().notNull(),
    monsterScore: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
  }),
  (table) => ({
    playerIdx: index().on(table.playerAddress),
    regionIdx: index().on(table.regionId),
  }),
);

export const huntEventRelations = relations(huntEvent, ({ one }) => ({
  player: one(player, {
    fields: [huntEvent.playerAddress],
    references: [player.id],
  }),
}));

// ---------------------------------------------------------------------------
// 10. HuntDropEvent (immutable)
// ---------------------------------------------------------------------------

export const huntDropEvent = onchainTable(
  "hunt_drop_event",
  (t) => ({
    id: t.text().primaryKey(),
    playerAddress: t.hex().notNull(),
    regionId: t.integer().notNull(),
    dropQuality: t.integer().notNull(),
    dropReward: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
  }),
  (table) => ({
    playerIdx: index().on(table.playerAddress),
  }),
);

export const huntDropEventRelations = relations(
  huntDropEvent,
  ({ one }) => ({
    player: one(player, {
      fields: [huntDropEvent.playerAddress],
      references: [player.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// 11. TreasureEvent (immutable)
// ---------------------------------------------------------------------------

export const treasureEvent = onchainTable(
  "treasure_event",
  (t) => ({
    id: t.text().primaryKey(),
    playerAddress: t.hex().notNull(),
    regionId: t.integer().notNull(),
    quality: t.integer().notNull(),
    reward: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
  }),
  (table) => ({
    playerIdx: index().on(table.playerAddress),
  }),
);

export const treasureEventRelations = relations(
  treasureEvent,
  ({ one }) => ({
    player: one(player, {
      fields: [treasureEvent.playerAddress],
      references: [player.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// 12. EquipmentToken (mutable)
// ---------------------------------------------------------------------------

export const equipmentToken = onchainTable(
  "equipment_token",
  (t) => ({
    id: t.text().primaryKey(),
    tokenId: t.bigint().notNull(),
    ownerAddress: t.hex().notNull(),
    equipmentType: t.integer().notNull().default(0),
    quality: t.integer().notNull().default(0),
    bonusBP: t.integer().notNull().default(0),
    enhanceLevel: t.integer().notNull().default(0),
    mintedAt: t.bigint().notNull().default(0n),
    mintedBlock: t.bigint().notNull().default(0n),
    decomposed: t.boolean().notNull().default(false),
    equippedBy: t.hex(),
  }),
  (table) => ({
    ownerIdx: index().on(table.ownerAddress),
  }),
);

export const equipmentTokenRelations = relations(
  equipmentToken,
  ({ one }) => ({
    owner: one(player, {
      fields: [equipmentToken.ownerAddress],
      references: [player.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// 13. EquipmentEnhancedEvent (immutable)
// ---------------------------------------------------------------------------

export const equipmentEnhancedEvent = onchainTable(
  "equipment_enhanced_event",
  (t) => ({
    id: t.text().primaryKey(),
    tokenId: t.bigint().notNull(),
    newLevel: t.integer().notNull(),
    cost: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    tokenIdx: index().on(table.tokenId),
  }),
);

// ---------------------------------------------------------------------------
// 14. EquipmentUpgradeEvent (immutable)
// ---------------------------------------------------------------------------

export const equipmentUpgradeEvent = onchainTable(
  "equipment_upgrade_event",
  (t) => ({
    id: t.text().primaryKey(),
    player: t.hex().notNull(),
    newTokenId: t.bigint().notNull(),
    quality: t.integer().notNull(),
    success: t.boolean().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    playerIdx: index().on(table.player),
  }),
);

// ---------------------------------------------------------------------------
// 15. EquipmentDecomposedEvent (immutable)
// ---------------------------------------------------------------------------

export const equipmentDecomposedEvent = onchainTable(
  "equipment_decomposed_event",
  (t) => ({
    id: t.text().primaryKey(),
    tokenId: t.bigint().notNull(),
    spiritMaterials: t.bigint().notNull(),
    lsRefund: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    tokenIdx: index().on(table.tokenId),
  }),
);

// ---------------------------------------------------------------------------
// 16. BeastToken (mutable)
// ---------------------------------------------------------------------------

export const beastToken = onchainTable(
  "beast_token",
  (t) => ({
    id: t.text().primaryKey(),
    tokenId: t.bigint().notNull(),
    ownerAddress: t.hex().notNull(),
    star: t.integer().notNull().default(0),
    element: t.integer().notNull().default(0),
    powerRate: t.integer().notNull().default(0),
    speciesId: t.integer().notNull().default(0),
    mintedAt: t.bigint().notNull().default(0n),
    mintedBlock: t.bigint().notNull().default(0n),
    equippedBy: t.hex(),
  }),
  (table) => ({
    ownerIdx: index().on(table.ownerAddress),
  }),
);

export const beastTokenRelations = relations(beastToken, ({ one }) => ({
  owner: one(player, {
    fields: [beastToken.ownerAddress],
    references: [player.id],
  }),
}));

// ---------------------------------------------------------------------------
// 17. BeastHuntEvent (immutable)
// ---------------------------------------------------------------------------

export const beastHuntEvent = onchainTable(
  "beast_hunt_event",
  (t) => ({
    id: t.text().primaryKey(),
    playerAddress: t.hex().notNull(),
    regionId: t.integer().notNull(),
    star: t.integer().notNull(),
    captured: t.boolean().notNull(),
    beastTokenId: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
  }),
  (table) => ({
    playerIdx: index().on(table.playerAddress),
  }),
);

export const beastHuntEventRelations = relations(
  beastHuntEvent,
  ({ one }) => ({
    player: one(player, {
      fields: [beastHuntEvent.playerAddress],
      references: [player.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// 18. CaveHeavenState (mutable)
// ---------------------------------------------------------------------------

export const caveHeavenState = onchainTable(
  "cave_heaven_state",
  (t) => ({
    id: t.hex().primaryKey(),
    playerAddress: t.hex().notNull(),
    tier: caveTier("tier").notNull().default("None"),
    openedAt: t.bigint().notNull().default(0n),
    upgradedAt: t.bigint(),
    totalMaintenancePaid: t.bigint().notNull().default(0n),
  }),
  (table) => ({
    playerIdx: index().on(table.playerAddress),
  }),
);

export const caveHeavenStateRelations = relations(
  caveHeavenState,
  ({ one }) => ({
    player: one(player, {
      fields: [caveHeavenState.playerAddress],
      references: [player.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// 19. CaveEvent (immutable)
// ---------------------------------------------------------------------------

export const caveEvent = onchainTable(
  "cave_event",
  (t) => ({
    id: t.text().primaryKey(),
    player: t.hex().notNull(),
    eventType: t.text().notNull(),
    tier: t.integer().notNull(),
    cost: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    playerIdx: index().on(table.player),
  }),
);

// ---------------------------------------------------------------------------
// 20. Partnership (mutable)
// ---------------------------------------------------------------------------

export const partnership = onchainTable(
  "partnership",
  (t) => ({
    id: t.text().primaryKey(),
    partnerA: t.hex().notNull(),
    partnerB: t.hex().notNull(),
    formedAt: t.bigint().notNull().default(0n),
    active: t.boolean().notNull().default(true),
    dissolvedAt: t.bigint(),
  }),
  (table) => ({
    partnerAIdx: index().on(table.partnerA),
    partnerBIdx: index().on(table.partnerB),
  }),
);

// ---------------------------------------------------------------------------
// 21. TaoEvent (immutable)
// ---------------------------------------------------------------------------

export const taoEvent = onchainTable(
  "tao_event",
  (t) => ({
    id: t.text().primaryKey(),
    eventType: t.text().notNull(),
    initiator: t.hex().notNull(),
    target: t.hex().notNull(),
    fee: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    initiatorIdx: index().on(table.initiator),
    targetIdx: index().on(table.target),
  }),
);

// ---------------------------------------------------------------------------
// 22. Sect (mutable)
// ---------------------------------------------------------------------------

export const sect = onchainTable(
  "sect",
  (t) => ({
    id: t.text().primaryKey(),
    sectId: t.bigint().notNull(),
    name: t.text().notNull(),
    master: t.hex().notNull(),
    memberCount: t.integer().notNull().default(0),
    createdAt: t.bigint().notNull().default(0n),
  }),
  (table) => ({
    masterIdx: index().on(table.master),
  }),
);

export const sectRelations = relations(sect, ({ many }) => ({
  memberships: many(sectMembership),
}));

// ---------------------------------------------------------------------------
// 23. SectMembership (mutable)
// ---------------------------------------------------------------------------

export const sectMembership = onchainTable(
  "sect_membership",
  (t) => ({
    id: t.text().primaryKey(),
    sectRef: t.text().notNull(),
    player: t.hex().notNull(),
    joinedAt: t.bigint().notNull().default(0n),
    active: t.boolean().notNull().default(true),
    leftAt: t.bigint(),
  }),
  (table) => ({
    sectIdx: index().on(table.sectRef),
    playerIdx: index().on(table.player),
  }),
);

export const sectMembershipRelations = relations(
  sectMembership,
  ({ one }) => ({
    sect: one(sect, {
      fields: [sectMembership.sectRef],
      references: [sect.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// 24. SectWar (mutable)
// ---------------------------------------------------------------------------

export const sectWar = onchainTable(
  "sect_war",
  (t) => ({
    id: t.text().primaryKey(),
    warId: t.bigint().notNull(),
    attackerSectId: t.bigint().notNull(),
    defenderSectId: t.bigint().notNull(),
    wager: t.bigint().notNull(),
    status: sectWarStatus("status").notNull().default("Pending"),
    initiatedAt: t.bigint().notNull().default(0n),
    winnerSectId: t.bigint(),
    settledAt: t.bigint(),
  }),
  (table) => ({
    statusIdx: index().on(table.status),
  }),
);

// ---------------------------------------------------------------------------
// 25. SecretRealmRun (immutable)
// ---------------------------------------------------------------------------

export const secretRealmRun = onchainTable(
  "secret_realm_run",
  (t) => ({
    id: t.text().primaryKey(),
    playerAddress: t.hex().notNull(),
    realmId: t.integer().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    playerIdx: index().on(table.playerAddress),
    realmIdx: index().on(table.realmId),
  }),
);

export const secretRealmRunRelations = relations(
  secretRealmRun,
  ({ one }) => ({
    player: one(player, {
      fields: [secretRealmRun.playerAddress],
      references: [player.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// 26. SecretRealmParty (mutable)
// ---------------------------------------------------------------------------

export const secretRealmParty = onchainTable(
  "secret_realm_party",
  (t) => ({
    id: t.text().primaryKey(),
    partyId: t.bigint().notNull(),
    leader: t.hex().notNull(),
    realmId: t.integer().notNull(),
    memberCount: t.integer().notNull().default(0),
    entered: t.boolean().notNull().default(false),
    createdAt: t.bigint().notNull().default(0n),
  }),
  (table) => ({
    leaderIdx: index().on(table.leader),
    realmIdx: index().on(table.realmId),
  }),
);

// ---------------------------------------------------------------------------
// 27. LayerChallengeEvent (immutable)
// ---------------------------------------------------------------------------

export const layerChallengeEvent = onchainTable(
  "layer_challenge_event",
  (t) => ({
    id: t.text().primaryKey(),
    player: t.hex().notNull(),
    realmId: t.integer().notNull(),
    layer: t.integer().notNull(),
    won: t.boolean().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    playerIdx: index().on(table.player),
    realmIdx: index().on(table.realmId),
  }),
);

// ---------------------------------------------------------------------------
// 28. LayerDropEvent (immutable)
// ---------------------------------------------------------------------------

export const layerDropEvent = onchainTable(
  "layer_drop_event",
  (t) => ({
    id: t.text().primaryKey(),
    player: t.hex().notNull(),
    realmId: t.integer().notNull(),
    layer: t.integer().notNull(),
    reward: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    playerIdx: index().on(table.player),
  }),
);

// ---------------------------------------------------------------------------
// 29. FeeCollectedEvent (immutable)
// ---------------------------------------------------------------------------

export const feeCollectedEvent = onchainTable(
  "fee_collected_event",
  (t) => ({
    id: t.text().primaryKey(),
    payer: t.hex().notNull(),
    amount: t.bigint().notNull(),
    burnAmount: t.bigint().notNull(),
    devAmount: t.bigint().notNull(),
    foundationAmount: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    payerIdx: index().on(table.payer),
  }),
);

// ---------------------------------------------------------------------------
// 30. TreasuryStats (mutable singleton)
// ---------------------------------------------------------------------------

export const treasuryStats = onchainTable("treasury_stats", (t) => ({
  id: t.text().primaryKey(),
  totalCollected: t.bigint().notNull().default(0n),
  totalBurned: t.bigint().notNull().default(0n),
  totalDev: t.bigint().notNull().default(0n),
  totalFoundation: t.bigint().notNull().default(0n),
}));

// ---------------------------------------------------------------------------
// 31. ProtocolStats (mutable singleton)
// ---------------------------------------------------------------------------

export const protocolStats = onchainTable("protocol_stats", (t) => ({
  id: t.text().primaryKey(),
  totalPlayers: t.integer().notNull().default(0),
  totalMatches: t.integer().notNull().default(0),
  totalChallenges: t.integer().notNull().default(0),
  totalOrders: t.integer().notNull().default(0),
  totalOrdersFilled: t.integer().notNull().default(0),
  totalEquipmentMinted: t.integer().notNull().default(0),
  totalBeastsMinted: t.integer().notNull().default(0),
  totalSectsCreated: t.integer().notNull().default(0),
}));
