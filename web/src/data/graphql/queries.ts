import { gql } from "graphql-request";

export const PLAYERS_QUERY = gql`
  query GetPlayers {
    players(first: 100, orderBy: totalMatchesWon, orderDirection: desc) {
      id
      name
      origin
      element
      realm
      totalMatchesPlayed
      totalMatchesWon
      totalWagerWon
      totalHunts
      totalTreasures
    }
  }
`;

export const PROTOCOL_STATS_QUERY = gql`
  query GetProtocolStats {
    protocolStats(id: "0x01000000") {
      id
      totalPlayers
      totalMatches
      totalChallenges
      totalOrders
      totalEquipmentMinted
      totalBeastsMinted
      totalSectsCreated
    }
  }
`;

export const RECENT_HUNTS_QUERY = gql`
  query RecentHunts {
    huntEvents(first: 10, orderBy: timestamp, orderDirection: desc) {
      id
      player {
        id
      }
      regionId
      won
      timestamp
    }
  }
`;

export const RECENT_BATTLES_QUERY = gql`
  query RecentBattles {
    battleMatches(first: 10, orderBy: settledAt, orderDirection: desc) {
      id
      matchId
      winner
      payout
      settledAt
    }
  }
`;

export const RECENT_TREASURES_QUERY = gql`
  query RecentTreasures {
    treasureEvents(first: 10, orderBy: timestamp, orderDirection: desc) {
      id
      player {
        id
      }
      regionId
      quality
      reward
      timestamp
    }
  }
`;

export const RECENT_BEAST_HUNTS_QUERY = gql`
  query RecentBeastHunts {
    beastHuntEvents(first: 10, orderBy: timestamp, orderDirection: desc) {
      id
      player {
        id
      }
      regionId
      star
      captured
      beastTokenId
      timestamp
    }
  }
`;

/** Single player's 24h activity across all event types. */
export const MY_AGENT_ACTIVITY_QUERY = gql`
  query MyAgentActivity($player: Bytes!, $since: BigInt!) {
    huntEvents(
      first: 50
      orderBy: timestamp
      orderDirection: desc
      where: { player: $player, timestamp_gte: $since }
    ) {
      id
      regionId
      won
      timestamp
    }
    battleMatchesWon: battleMatches(
      first: 50
      orderBy: settledAt
      orderDirection: desc
      where: { winner: $player, settledAt_gte: $since }
    ) {
      id
      matchId
      winner
      payout
      settledAt
    }
    treasureEvents(
      first: 50
      orderBy: timestamp
      orderDirection: desc
      where: { player: $player, timestamp_gte: $since }
    ) {
      id
      regionId
      quality
      reward
      timestamp
    }
    cultivationSessions(
      first: 50
      orderBy: timestamp
      orderDirection: desc
      where: { player: $player, timestamp_gte: $since }
    ) {
      id
      duration
      lsEarned
      expGained
      heartGained
      fortuneGained
      timestamp
    }
    breakthroughEvents(
      first: 50
      orderBy: timestamp
      orderDirection: desc
      where: { player: $player, timestamp_gte: $since }
    ) {
      id
      fromRealm
      toRealm
      success
      timestamp
    }
    beastHuntEvents(
      first: 50
      orderBy: timestamp
      orderDirection: desc
      where: { player: $player, timestamp_gte: $since }
    ) {
      id
      regionId
      star
      captured
      beastTokenId
      timestamp
    }
    layerChallengeEvents(
      first: 50
      orderBy: timestamp
      orderDirection: desc
      where: { player: $player, timestamp_gte: $since }
    ) {
      id
      realmId
      layer
      won
      timestamp
    }
    layerDropEvents(
      first: 50
      orderBy: timestamp
      orderDirection: desc
      where: { player: $player, timestamp_gte: $since }
    ) {
      id
      realmId
      layer
      reward
      timestamp
    }
  }
`;

export const RECENT_REALM_CHALLENGES_QUERY = gql`
  query RecentRealmChallenges {
    layerChallengeEvents(first: 10, orderBy: timestamp, orderDirection: desc) {
      id
      player
      realmId
      layer
      won
      timestamp
    }
  }
`;

export const RECENT_REALM_DROPS_QUERY = gql`
  query RecentRealmDrops {
    layerDropEvents(first: 10, orderBy: timestamp, orderDirection: desc) {
      id
      player
      realmId
      layer
      reward
      timestamp
    }
  }
`;

/** Active market orders for 坊市 panel. */
export const MARKET_ORDERS_QUERY = gql`
  query MarketOrders {
    marketOrders(
      first: 50
      orderBy: createdAt
      orderDirection: desc
      where: { status: "Active" }
    ) {
      id
      orderId
      sellerAddress
      tokenContract
      tokenId
      price
      status
      createdAt
      isERC1155
      amount
    }
  }
`;

/** Player's equipment inventory (owned, not decomposed). */
export const PLAYER_EQUIPMENT_QUERY = gql`
  query PlayerEquipment($owner: Bytes!) {
    equipmentTokens(
      where: { ownerAddress: $owner, decomposed: false }
      orderBy: mintedAt
      orderDirection: desc
      first: 100
    ) {
      id
      tokenId
      equipmentType
      quality
      bonusBP
      enhanceLevel
      elementAffinity
      originAffinity
      factionAffinity
      equippedBy
      mintedAt
    }
  }
`;

/** Player's beast inventory (owned beasts). */
export const PLAYER_BEASTS_QUERY = gql`
  query PlayerBeasts($owner: Bytes!) {
    beastTokens(
      where: { owner: $owner }
      orderBy: mintedAt
      orderDirection: desc
      first: 100
    ) {
      id
      tokenId
      star
      element
      powerRate
      speciesId
      equippedBy
      mintedAt
    }
  }
`;

/** Open PvP challenges for the battle panel. */
export const OPEN_CHALLENGES_QUERY = gql`
  query OpenChallenges {
    challenges(
      where: { status: "Open" }
      orderBy: createdAt
      orderDirection: desc
      first: 50
    ) {
      id
      challengeId
      creator {
        id
        element
        realm
      }
      wager
      createdAt
    }
  }
`;

/** All sects for the 宗门 panel. */
export const SECTS_QUERY = gql`
  query GetSects {
    sects(first: 100, orderBy: memberCount, orderDirection: desc) {
      id
      sectId
      name
      master
      memberCount
      createdAt
    }
  }
`;

/** Server-wide 24h activity for daily digest generation. */
export const DAILY_DIGEST_QUERY = gql`
  query DailyDigestActivity($since: BigInt!) {
    huntEvents(first: 1000, where: { timestamp_gte: $since }) {
      id
      player {
        id
      }
      won
    }
    battleMatches(first: 1000, where: { settledAt_gte: $since }) {
      id
      winner
      payout
    }
    treasureEvents(first: 1000, where: { timestamp_gte: $since }) {
      id
      player {
        id
      }
      quality
    }
    cultivationSessions(first: 1000, where: { timestamp_gte: $since }) {
      id
      player {
        id
      }
      lsEarned
      expGained
    }
    breakthroughEvents(first: 1000, where: { timestamp_gte: $since }) {
      id
      player {
        id
      }
      fromRealm
      toRealm
      success
    }
  }
`;
