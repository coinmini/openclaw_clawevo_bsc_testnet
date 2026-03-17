// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./interfaces/ILingShi.sol";
import "./interfaces/IGameConfig.sol";
import "./libraries/Constants.sol";

/// @title Register — 修仙者注册（两步 block-delay 防操纵）
/// @notice TX1: registerIntent → TX2: finalizeRegistration（隔 ≥1 block）
contract Register {
    // ── 数据结构 ──
    struct Cultivator {
        uint8 origin;          // 0-3: 草莽/游商/苦力/书生
        uint8 element;         // 0-4: 金/木/水/火/土
        uint8 faction;         // 0-3: 剑修/体修/阵修/魂修
        uint8 realm;           // 0-4: 练气/筑基/金丹/元婴/化神
        uint8 subRealm;        // 0-8: 1重-9重（存储为 0-indexed）
        uint256 attack;        // 灵力
        uint256 defense;       // 体魄
        uint256 perception;    // 神识
        uint256 wisdom;        // 悟性
        uint256 heart;         // 道心
        uint256 fortune;       // 气运
        uint256 registeredAt;  // 注册时间戳
        string name;           // 角色名（玩家自设）
    }

    struct RegisterIntent {
        uint8 origin;
        uint8 faction;
        uint256 blockNumber;
        bool finalized;
        string name;
    }

    ILingShi public immutable lingshi;
    IGameConfig public immutable gameConfig;
    address public owner;

    mapping(address => Cultivator) private _cultivators;
    mapping(address => RegisterIntent) private _intents;
    mapping(address => bool) public isRegistered;
    mapping(address => bool) public authorizedUpdaters; // 授权可更新属性的合约
    mapping(address => uint256) public experience; // 累计修为（经验值）

    uint256 private _nonce; // 辅助随机数种子

    // ── Events ──
    event RegisterIntentCreated(
        address indexed player,
        uint8 origin,
        uint256 blockNumber
    );

    event CultivatorRegistered(
        address indexed player,
        uint8 origin,
        uint8 element,
        uint256 attack,
        uint256 defense,
        uint256 perception,
        uint256 wisdom
    );

    event NameSet(address indexed player, string name);
    event ExperienceAdded(address indexed player, uint256 amount, uint256 total);
    event SubRealmUpdated(address indexed player, uint8 newSubRealm);
    event AttributesUpdated(
        address indexed player,
        uint256 attack,
        uint256 defense,
        uint256 perception,
        uint256 wisdom
    );

    constructor(address _lingshi, address _gameConfig) {
        require(_lingshi != address(0), "Register: zero lingshi");
        require(_gameConfig != address(0), "Register: zero config");
        lingshi = ILingShi(_lingshi);
        gameConfig = IGameConfig(_gameConfig);
        owner = msg.sender;
    }

    /// @notice 第一步：提交注册意向
    /// @param origin 出身选择 (0=草莽, 1=游商, 2=苦力, 3=书生)
    /// @param faction 流派选择 (0=剑修, 1=体修, 2=阵修, 3=魂修)
    /// @param name 角色名（1-16 bytes）
    function registerIntent(uint8 origin, uint8 faction, string calldata name) external {
        require(!isRegistered[msg.sender], "Register: already registered");
        require(_intents[msg.sender].blockNumber == 0, "Register: intent exists");
        require(origin < Constants.ORIGIN_COUNT, "Register: invalid origin");
        require(faction < Constants.FACTION_COUNT, "Register: invalid faction");
        uint256 nameLen = bytes(name).length;
        require(nameLen >= 1 && nameLen <= 16, "Register: name 1-16 bytes");

        _intents[msg.sender] = RegisterIntent({
            origin: origin,
            faction: faction,
            blockNumber: block.number,
            finalized: false,
            name: name
        });

        emit RegisterIntentCreated(msg.sender, origin, block.number);
    }

    /// @notice 第二步：完成注册（需隔 ≥1 block）
    function finalizeRegistration() external {
        RegisterIntent storage intent = _intents[msg.sender];
        require(intent.blockNumber > 0, "Register: no intent");
        require(!intent.finalized, "Register: already finalized");
        require(block.number > intent.blockNumber, "Register: same block");

        uint256 window = gameConfig.blockDelayWindow();
        require(
            block.number - intent.blockNumber <= window,
            "Register: window expired"
        );

        // Block-delay 随机五行（使用 intent 所在块的 hash，finalize 时该块必已确认）
        bytes32 blockHash = blockhash(intent.blockNumber);
        require(blockHash != bytes32(0), "Register: blockhash unavailable");

        uint8 element = uint8(
            uint256(
                keccak256(abi.encodePacked(blockHash, msg.sender, _nonce))
            ) % Constants.ELEMENT_COUNT
        );
        _nonce++;

        // 计算初始属性（练气1重，base=100 + 出身加成）
        (
            uint256 attack,
            uint256 defense,
            uint256 perception,
            uint256 wisdom
        ) = _computeInitialAttributes(intent.origin);

        _cultivators[msg.sender] = Cultivator({
            origin: intent.origin,
            element: element,
            faction: intent.faction,
            realm: 0,       // 练气
            subRealm: 0,    // 1重 (0-indexed)
            attack: attack,
            defense: defense,
            perception: perception,
            wisdom: wisdom,
            heart: 0,
            fortune: 0,
            registeredAt: block.timestamp,
            name: intent.name
        });

        intent.finalized = true;
        isRegistered[msg.sender] = true;

        // 发放初始灵石
        uint256 initialLS = gameConfig.initialLingShi();
        if (initialLS > 0) {
            lingshi.mint(msg.sender, initialLS);
        }

        emit CultivatorRegistered(
            msg.sender,
            intent.origin,
            element,
            attack,
            defense,
            perception,
            wisdom
        );
        emit NameSet(msg.sender, intent.name);
    }

    /// @notice 查询修仙者信息
    function getCultivator(address player) external view returns (Cultivator memory) {
        require(isRegistered[player], "Register: not registered");
        return _cultivators[player];
    }

    /// @notice 查询境界（供外部合约低开销读取）
    function getRealm(address player) external view returns (uint8) {
        return _cultivators[player].realm;
    }

    /// @notice 查询注册意向
    function getIntent(address player) external view returns (RegisterIntent memory) {
        return _intents[player];
    }

    /// @notice 设置/修改角色名（仅限已注册玩家自己调用）
    /// @param newName 角色名（1-16 bytes）
    function setName(string calldata newName) external {
        require(isRegistered[msg.sender], "Register: not registered");
        uint256 len = bytes(newName).length;
        require(len >= 1 && len <= 16, "Register: name 1-16 bytes");
        _cultivators[msg.sender].name = newName;
        emit NameSet(msg.sender, newName);
    }

    // ── 属性更新（授权合约调用）──

    /// @notice 更新境界（用于渡劫突破等）
    function updateRealm(address player, uint8 newRealm) external {
        require(authorizedUpdaters[msg.sender], "Register: unauthorized updater");
        require(isRegistered[player], "Register: not registered");
        require(newRealm < Constants.REALM_COUNT, "Register: invalid realm");
        _cultivators[player].realm = newRealm;
    }

    /// @notice 更新小境界（重）
    function updateSubRealm(address player, uint8 newSubRealm) external {
        require(authorizedUpdaters[msg.sender], "Register: unauthorized updater");
        require(isRegistered[player], "Register: not registered");
        require(newSubRealm < Constants.MAX_SUB_REALM, "Register: invalid subRealm");
        _cultivators[player].subRealm = newSubRealm;
        emit SubRealmUpdated(player, newSubRealm);
    }

    /// @notice 增加修为经验
    function addExperience(address player, uint256 amount) external {
        require(authorizedUpdaters[msg.sender], "Register: unauthorized updater");
        require(isRegistered[player], "Register: not registered");
        experience[player] += amount;
        emit ExperienceAdded(player, amount, experience[player]);
    }

    /// @notice 扣减修为经验（升重消耗）
    function consumeExperience(address player, uint256 amount) external {
        require(authorizedUpdaters[msg.sender], "Register: unauthorized updater");
        require(isRegistered[player], "Register: not registered");
        require(experience[player] >= amount, "Register: insufficient experience");
        experience[player] -= amount;
    }

    /// @notice 更新四维属性（升重/突破时调用）
    function updateAttributes(
        address player,
        uint256 atk,
        uint256 def,
        uint256 per,
        uint256 wis
    ) external {
        require(authorizedUpdaters[msg.sender], "Register: unauthorized updater");
        require(isRegistered[player], "Register: not registered");
        _cultivators[player].attack = atk;
        _cultivators[player].defense = def;
        _cultivators[player].perception = per;
        _cultivators[player].wisdom = wis;
        emit AttributesUpdated(player, atk, def, per, wis);
    }

    /// @notice 设置授权更新者
    function setAuthorizedUpdater(address updater, bool authorized) external {
        require(msg.sender == owner, "Register: not owner");
        require(updater != address(0), "Register: zero address");
        authorizedUpdaters[updater] = authorized;
    }

    /// @notice 转移合约所有权
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Register: not owner");
        require(newOwner != address(0), "Register: zero address");
        owner = newOwner;
    }

    // ── 内部函数 ──

    /// @dev 根据出身计算练气1重初始属性
    /// 草莽: attack ×1.15, defense ×1.05
    /// 游商: perception ×1.15
    /// 苦力: defense ×1.15
    /// 书生: wisdom ×1.15
    function _computeInitialAttributes(uint8 origin)
        internal
        pure
        returns (uint256 attack, uint256 defense, uint256 perception, uint256 wisdom)
    {
        uint256 base = Constants.BASE_ATTRIBUTE_QI_1;
        attack = base;
        defense = base;
        perception = base;
        wisdom = base;

        if (origin == 0) {
            // 草莽: attack +15%, defense +5%
            attack = (base * Constants.ORIGIN_BONUS_PRIMARY_BP) / Constants.BP;
            defense = (base * Constants.ORIGIN_BONUS_SECONDARY_BP) / Constants.BP;
        } else if (origin == 1) {
            // 游商: perception +15%
            perception = (base * Constants.ORIGIN_BONUS_PRIMARY_BP) / Constants.BP;
        } else if (origin == 2) {
            // 苦力: defense +15%
            defense = (base * Constants.ORIGIN_BONUS_PRIMARY_BP) / Constants.BP;
        } else {
            // 书生: wisdom +15%
            wisdom = (base * Constants.ORIGIN_BONUS_PRIMARY_BP) / Constants.BP;
        }
    }
}
