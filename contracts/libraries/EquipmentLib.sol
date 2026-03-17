// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../interfaces/IEquipment.sol";
import "./Constants.sol";

/// @title EquipmentLib — 装备数值工具库
/// @notice 共享的装备 bonusBP 生成 + 有效加成计算逻辑
library EquipmentLib {
    /// @notice 按品质范围生成随机 bonusBP
    /// @param quality 装备品质
    /// @param seed 随机种子
    /// @return bonusBP 在品质范围内的值
    function randomBonusBP(
        IEquipment.Quality quality,
        uint256 seed
    ) internal pure returns (uint16) {
        (uint16 minBP, uint16 maxBP) = _bonusRange(quality);
        uint256 range = uint256(maxBP - minBP) + 1;
        return minBP + uint16((seed >> 128) % range);
    }

    /// @notice 计算装备有效加成（含强化 + 亲和度匹配）
    /// @param data 装备数据
    /// @param playerElement 玩家五行属性 (0-4)
    /// @param playerOrigin 玩家出身 (0-3)
    /// @return effectiveBP 有效加成值 (basis points)
    function getEffectiveBonusBP(
        IEquipment.EquipmentData memory data,
        uint8 playerElement,
        uint8 playerOrigin
    ) internal pure returns (uint16) {
        // 基础 bonusBP
        uint256 bp = uint256(data.bonusBP);

        // 强化加成: 每级 +100 BP (+1%)
        bp += uint256(data.enhanceLevel) * 100;

        // 亲和度加成
        // 元素匹配: +100 BP (+1%)
        if (data.elementAffinity != 0 && data.elementAffinity == playerElement + 1) {
            bp += 100;
        }
        // 出身匹配: +50 BP (+0.5%)
        if (data.originAffinity != 0 && data.originAffinity == playerOrigin + 1) {
            bp += 50;
        }
        // 流派匹配: +50 BP (+0.5%) — 流派为隐藏信息，此处预留
        // factionAffinity 暂不参与战力计算（ZK commit 模式）

        return uint16(bp);
    }

    /// @notice 根据掉落品质随机生成装备类型 (WEAPON 或 ARMOR)
    /// @param seed 随机种子
    /// @return eType 装备类型
    function randomEquipmentType(
        uint256 seed
    ) internal pure returns (IEquipment.EquipmentType) {
        return (seed % 2 == 0)
            ? IEquipment.EquipmentType.WEAPON
            : IEquipment.EquipmentType.ARMOR;
    }

    /// @notice 根据随机种子生成亲和度值 (0 = 无亲和, 1-5 = 对应元素/出身)
    /// @param seed 随机种子
    /// @param maxVal 最大值 (5 for element, 4 for origin/faction)
    /// @return affinity 0 = 无, 1~maxVal = 具体亲和
    function randomAffinity(
        uint256 seed,
        uint8 maxVal
    ) internal pure returns (uint8) {
        // 50% 概率无亲和度
        if (seed % 2 == 0) return 0;
        return uint8((seed >> 8) % maxVal) + 1;
    }

    /// @dev 获取品质的 bonusBP 范围
    function _bonusRange(
        IEquipment.Quality quality
    ) private pure returns (uint16 minBP, uint16 maxBP) {
        if (quality == IEquipment.Quality.WHITE) {
            return (Constants.WHITE_BONUS_MIN, Constants.WHITE_BONUS_MAX);
        } else if (quality == IEquipment.Quality.GREEN) {
            return (Constants.GREEN_BONUS_MIN, Constants.GREEN_BONUS_MAX);
        } else if (quality == IEquipment.Quality.BLUE) {
            return (Constants.BLUE_BONUS_MIN, Constants.BLUE_BONUS_MAX);
        } else {
            return (Constants.PURPLE_BONUS_MIN, Constants.PURPLE_BONUS_MAX);
        }
    }
}
