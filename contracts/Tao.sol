// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./interfaces/ILingShi.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/ITao.sol";
import "./Register.sol";
import "./libraries/Constants.sol";

/// @title Tao — 道侣系统（结/解/被动加成）
/// @notice 两个修仙者链上绑定，享有道心/气运 +3% 被动加成
contract Tao is ITao {
    ILingShi public immutable lingshi;
    ITreasury public immutable treasury;
    Register public immutable register;
    address public owner;

    // ── 道侣关系 ──
    mapping(address => address) public partners;              // player → partner
    mapping(address => Partnership) private _partnerships;    // partnerA → data

    // ── 邀请 ──
    struct Proposal {
        address target;
        uint256 createdAt;
        bool active;
    }
    mapping(address => Proposal) public proposals;            // proposer → proposal

    // ── 冷却 ──
    struct CooldownInfo {
        uint256 cooldownEnd;
    }
    mapping(address => CooldownInfo) private _cooldowns;

    // ── Configurable parameters ──
    uint256 public betrothalFee;
    uint256 public dissolutionFee;
    uint256 public initiatorCooldown;
    uint256 public recipientCooldown;
    uint8 public maxRealmDiff;
    uint256 public passiveBonusBP;

    // ── Events ──
    event PartnershipProposed(address indexed proposer, address indexed target);
    event PartnershipFormed(address indexed partnerA, address indexed partnerB);
    event ProposalCancelled(address indexed proposer, address indexed target);
    event PartnershipDissolved(address indexed initiator, address indexed partner, uint256 fee);
    event BetrothalFeeUpdated(uint256 oldValue, uint256 newValue);
    event DissolutionFeeUpdated(uint256 oldValue, uint256 newValue);
    event InitiatorCooldownUpdated(uint256 oldValue, uint256 newValue);
    event RecipientCooldownUpdated(uint256 oldValue, uint256 newValue);
    event MaxRealmDiffUpdated(uint8 oldValue, uint8 newValue);
    event PassiveBonusBPUpdated(uint256 oldValue, uint256 newValue);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Tao: not owner");
        _;
    }

    constructor(
        address _lingshi,
        address _treasury,
        address _register
    ) {
        require(_lingshi != address(0), "Tao: zero lingshi");
        require(_treasury != address(0), "Tao: zero treasury");
        require(_register != address(0), "Tao: zero register");

        lingshi = ILingShi(_lingshi);
        treasury = ITreasury(_treasury);
        register = Register(_register);
        owner = msg.sender;

        betrothalFee = Constants.TAO_BETROTHAL_FEE;
        dissolutionFee = Constants.TAO_DISSOLUTION_FEE;
        initiatorCooldown = Constants.TAO_INITIATOR_COOLDOWN;
        recipientCooldown = Constants.TAO_RECIPIENT_COOLDOWN;
        maxRealmDiff = Constants.TAO_MAX_REALM_DIFF;
        passiveBonusBP = Constants.TAO_PASSIVE_BONUS_BP;
    }

    // ═══════════════════════════════════════════
    //              ADMIN SETTERS
    // ═══════════════════════════════════════════

    function setBetrothalFee(uint256 newValue) external onlyOwner {
        uint256 old = betrothalFee;
        betrothalFee = newValue;
        emit BetrothalFeeUpdated(old, newValue);
    }

    function setDissolutionFee(uint256 newValue) external onlyOwner {
        uint256 old = dissolutionFee;
        dissolutionFee = newValue;
        emit DissolutionFeeUpdated(old, newValue);
    }

    function setInitiatorCooldown(uint256 newValue) external onlyOwner {
        require(newValue <= 30 days, "Tao: cooldown too large");
        uint256 old = initiatorCooldown;
        initiatorCooldown = newValue;
        emit InitiatorCooldownUpdated(old, newValue);
    }

    function setRecipientCooldown(uint256 newValue) external onlyOwner {
        require(newValue <= 30 days, "Tao: cooldown too large");
        uint256 old = recipientCooldown;
        recipientCooldown = newValue;
        emit RecipientCooldownUpdated(old, newValue);
    }

    function setMaxRealmDiff(uint8 newValue) external onlyOwner {
        require(newValue <= Constants.REALM_COUNT, "Tao: diff too large");
        uint8 old = maxRealmDiff;
        maxRealmDiff = newValue;
        emit MaxRealmDiffUpdated(old, newValue);
    }

    function setPassiveBonusBP(uint256 newValue) external onlyOwner {
        require(newValue <= Constants.BP, "Tao: bonus > 100%");
        uint256 old = passiveBonusBP;
        passiveBonusBP = newValue;
        emit PassiveBonusBPUpdated(old, newValue);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Tao: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── 发起邀请 ──

    /// @notice 发起道侣邀请
    function proposePartnership(address partner) external {
        require(register.isRegistered(msg.sender), "Tao: proposer not registered");
        require(register.isRegistered(partner), "Tao: target not registered");
        require(partner != msg.sender, "Tao: cannot propose self");
        require(partners[msg.sender] == address(0), "Tao: already has partner");
        require(partners[partner] == address(0), "Tao: target has partner");
        require(!proposals[msg.sender].active, "Tao: proposal pending");

        // 冷却检查
        require(_cooldowns[msg.sender].cooldownEnd <= block.timestamp, "Tao: proposer in cooldown");
        require(_cooldowns[partner].cooldownEnd <= block.timestamp, "Tao: target in cooldown");

        // 境界差检查
        Register.Cultivator memory cA = register.getCultivator(msg.sender);
        Register.Cultivator memory cB = register.getCultivator(partner);
        uint8 diff = cA.realm > cB.realm ? cA.realm - cB.realm : cB.realm - cA.realm;
        require(diff <= maxRealmDiff, "Tao: realm diff too large");

        proposals[msg.sender] = Proposal({
            target: partner,
            createdAt: block.timestamp,
            active: true
        });

        emit PartnershipProposed(msg.sender, partner);
    }

    // ── 接受邀请 ──

    /// @notice 接受道侣邀请，双方各扣 50 LS
    function acceptPartnership(address proposer) external {
        Proposal storage prop = proposals[proposer];
        require(prop.active, "Tao: no active proposal");
        require(prop.target == msg.sender, "Tao: not target");
        require(partners[msg.sender] == address(0), "Tao: already has partner");
        require(partners[proposer] == address(0), "Tao: proposer has partner");

        // 冷却检查（双方在接受时也需再次检查）
        require(_cooldowns[msg.sender].cooldownEnd <= block.timestamp, "Tao: accepter in cooldown");
        require(_cooldowns[proposer].cooldownEnd <= block.timestamp, "Tao: proposer in cooldown");

        // 收取定情灵石
        uint256 fee = betrothalFee;
        require(lingshi.balanceOf(proposer) >= fee, "Tao: proposer insufficient LS");
        require(lingshi.balanceOf(msg.sender) >= fee, "Tao: accepter insufficient LS");

        _collectPayment(proposer, fee);
        _collectPayment(msg.sender, fee);

        // 清理邀请
        prop.active = false;

        // 建立关系
        partners[proposer] = msg.sender;
        partners[msg.sender] = proposer;

        _partnerships[_getPartnershipKey(proposer, msg.sender)] = Partnership({
            partnerA: proposer,
            partnerB: msg.sender,
            since: block.timestamp,
            dualCultCount: 0,
            huntCount: 0
        });

        emit PartnershipFormed(proposer, msg.sender);
    }

    // ── 撤回邀请 ──

    /// @notice 撤回道侣邀请
    function cancelProposal() external {
        Proposal storage prop = proposals[msg.sender];
        require(prop.active, "Tao: no active proposal");

        address target = prop.target;
        prop.active = false;

        emit ProposalCancelled(msg.sender, target);
    }

    // ── 解除道侣 ──

    /// @notice 主动解除道侣关系
    function dissolvePartnership() external {
        address partner = partners[msg.sender];
        require(partner != address(0), "Tao: no partner");

        // 手续费: min(20, balance)
        uint256 balance = lingshi.balanceOf(msg.sender);
        uint256 fee = balance < dissolutionFee ? balance : dissolutionFee;

        if (fee > 0) {
            _collectPayment(msg.sender, fee);
        }

        // 设置冷却
        _cooldowns[msg.sender] = CooldownInfo({
            cooldownEnd: block.timestamp + initiatorCooldown
        });
        _cooldowns[partner] = CooldownInfo({
            cooldownEnd: block.timestamp + recipientCooldown
        });

        // 清除关系
        delete _partnerships[_getPartnershipKey(msg.sender, partner)];
        partners[msg.sender] = address(0);
        partners[partner] = address(0);

        emit PartnershipDissolved(msg.sender, partner, fee);
    }

    // ── View 函数 ──

    /// @notice 查询道侣地址
    function getPartner(address cultivator) external view override returns (address) {
        return partners[cultivator];
    }

    /// @notice 查询道侣关系详情
    function getPartnership(address cultivator) external view override returns (Partnership memory) {
        address partner = partners[cultivator];
        if (partner == address(0)) {
            return Partnership(address(0), address(0), 0, 0, 0);
        }
        address key = _getPartnershipKey(cultivator, partner);
        return _partnerships[key];
    }

    /// @notice 查询冷却状态
    function isInCooldown(address cultivator) external view override returns (bool inCooldown, uint256 cooldownEnd) {
        CooldownInfo memory cd = _cooldowns[cultivator];
        if (cd.cooldownEnd > block.timestamp) {
            return (true, cd.cooldownEnd);
        }
        return (false, 0);
    }

    /// @notice 查询道侣被动加成（道心/气运各 +3%）
    function getCultivationBonus(address cultivator) external view override returns (uint256 heartBonus, uint256 luckBonus) {
        if (partners[cultivator] != address(0)) {
            return (passiveBonusBP, passiveBonusBP);
        }
        return (0, 0);
    }

    // ── 内部函数 ──

    /// @dev 获取道侣关系存储 key（始终以地址较小者为 key）
    function _getPartnershipKey(address a, address b) internal pure returns (address) {
        return a < b ? a : b;
    }

    /// @dev 收取费用通过 Treasury 分配
    function _collectPayment(address payer, uint256 amount) internal {
        if (amount == 0) return;
        lingshi.transferFrom(payer, address(this), amount);
        lingshi.approve(address(treasury), amount);
        treasury.collectFee(address(this), amount);
    }
}
