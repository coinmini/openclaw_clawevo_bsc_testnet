// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./GameAccount.sol";
import "./interfaces/IGameAccount.sol";

/// @title GameAccountFactory — ERC-4337 托管钱包工厂
/// @notice Creates EIP-1167 minimal proxy accounts with managed mode for new players
/// @dev Deterministic addresses via Clones.cloneDeterministic(impl, salt)
contract GameAccountFactory is Ownable {
    using Clones for address;

    // ── Custom Errors ──
    error ZeroAddress();
    error NotAccountOwner();
    error AlreadyMigrated();
    error MigrationConditionNotMet();
    error InvalidFee();
    error TransferFailed();

    // ── Events ──
    event AccountCreated(address indexed ownerEOA, address indexed account);
    event AccountMigrated(address indexed account, bool paidBNB);
    event MigrationFeeUpdated(uint256 oldFee, uint256 newFee);
    event MigrationRecipientUpdated(address oldRecipient, address newRecipient);

    // ── Immutables ──
    address public immutable implementation;
    address public immutable entryPointAddr;
    address public immutable lingshiAddr;

    // ── State ──
    address public registerAddr;
    uint256 public migrationFee;
    address public migrationRecipient;

    // ── Mappings ──
    mapping(address => address) public accountOf;   // ownerEOA => GameAccount
    mapping(address => address) public ownerOf;     // GameAccount => ownerEOA
    mapping(address => bool) public isGameAccount;
    uint256 public totalAccounts;

    // ── Required realm for free migration (筑基 = 1) ──
    uint8 private constant MIGRATION_REALM = 1;

    // ── Constructor ──

    /// @param entryPoint_ ERC-4337 EntryPoint address
    /// @param register_ Register.sol address (for realm check)
    /// @param lingshi_ LingShi.sol address
    /// @param migrationRecipient_ Address to receive BNB migration fees
    /// @param owner_ Factory owner
    constructor(
        address entryPoint_,
        address register_,
        address lingshi_,
        address migrationRecipient_,
        address owner_
    ) Ownable(owner_) {
        if (entryPoint_ == address(0)) revert ZeroAddress();
        if (register_ == address(0)) revert ZeroAddress();
        if (lingshi_ == address(0)) revert ZeroAddress();
        if (migrationRecipient_ == address(0)) revert ZeroAddress();

        // Deploy the implementation contract (used as clone template)
        implementation = address(new GameAccount());
        entryPointAddr = entryPoint_;
        registerAddr = register_;
        lingshiAddr = lingshi_;
        migrationRecipient = migrationRecipient_;
        migrationFee = 0.005 ether;
    }

    // ── Account Creation ──

    /// @notice Create a new managed account for an owner EOA
    /// @param ownerEOA The owner's externally owned account
    /// @return account The created (or existing) GameAccount address
    function createAccount(address ownerEOA) external returns (address account) {
        if (ownerEOA == address(0)) revert ZeroAddress();

        // Idempotent: return existing account if already created
        account = accountOf[ownerEOA];
        if (account != address(0)) return account;

        // Deploy deterministic clone
        bytes32 salt = keccak256(abi.encodePacked(ownerEOA));
        account = implementation.cloneDeterministic(salt);

        // Initialize the clone
        IGameAccount(account).initialize(ownerEOA, entryPointAddr, lingshiAddr);

        // Record mappings
        accountOf[ownerEOA] = account;
        ownerOf[account] = ownerEOA;
        isGameAccount[account] = true;
        totalAccounts++;

        emit AccountCreated(ownerEOA, account);
    }

    /// @notice Predict the account address for an owner EOA (before creation)
    /// @param ownerEOA The owner's externally owned account
    /// @return The deterministic address
    function predictAddress(address ownerEOA) external view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(ownerEOA));
        return implementation.predictDeterministicAddress(salt, address(this));
    }

    // ── Migration ──

    /// @notice Migrate account from managed to autonomous mode
    /// @dev Caller must be the account's owner EOA
    /// @param account The GameAccount address to migrate
    function migrateAccount(address account) external payable {
        address accountOwner = ownerOf[account];
        if (accountOwner != msg.sender) revert NotAccountOwner();
        if (!IGameAccount(account).managed()) revert AlreadyMigrated();

        // Check migration condition: realm >= 筑基 OR pay fee
        bool realmMet = _checkRealmCondition(account);
        bool feePaid = msg.value >= migrationFee;

        if (!realmMet && !feePaid) revert MigrationConditionNotMet();

        // Execute migration
        IGameAccount(account).setManaged(false);

        // Forward BNB payment if any
        if (msg.value > 0) {
            (bool success, ) = migrationRecipient.call{value: msg.value}("");
            if (!success) revert TransferFailed();
        }

        emit AccountMigrated(account, feePaid);
    }

    // ── Admin ──

    /// @notice Update the migration fee
    /// @param newFee New fee in wei (0 = free migration allowed if realm met)
    function setMigrationFee(uint256 newFee) external onlyOwner {
        if (newFee > 1 ether) revert InvalidFee();
        uint256 oldFee = migrationFee;
        migrationFee = newFee;
        emit MigrationFeeUpdated(oldFee, newFee);
    }

    /// @notice Update the Register contract address
    /// @param register_ New Register address
    function setRegister(address register_) external onlyOwner {
        if (register_ == address(0)) revert ZeroAddress();
        registerAddr = register_;
    }

    /// @notice Update the migration fee recipient
    /// @param recipient_ New recipient address
    function setMigrationRecipient(address recipient_) external onlyOwner {
        if (recipient_ == address(0)) revert ZeroAddress();
        address old = migrationRecipient;
        migrationRecipient = recipient_;
        emit MigrationRecipientUpdated(old, recipient_);
    }

    // ── Internal ──

    /// @dev Check if the account's cultivator has reached 筑基 (realm >= 1)
    function _checkRealmCondition(address account) internal view returns (bool) {
        // Use low-level staticcall to avoid import dependency on Register
        (bool success, bytes memory data) = registerAddr.staticcall(
            abi.encodeWithSignature("isRegistered(address)", account)
        );

        if (!success || data.length < 32) return false;

        bool registered = abi.decode(data, (bool));
        if (!registered) return false;

        // Read realm via dedicated getter (avoids brittle struct ABI parsing)
        (bool success2, bytes memory data2) = registerAddr.staticcall(
            abi.encodeWithSignature("getRealm(address)", account)
        );

        if (!success2 || data2.length < 32) return false;

        uint8 realm = abi.decode(data2, (uint8));
        return realm >= MIGRATION_REALM;
    }
}
