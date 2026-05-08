# CSS 重构与优化计划 (styles.css)

目前 `styles.css` 高达 11,491 行，并包含 1,357 个 `!important` 声明。这不仅导致文件体积庞大，还引起了严重的“特异性战争”（样式冲突与互相覆盖）。

为了在**完全保留液态玻璃视觉效果**的前提下对其进行安全优化，计划分为以下 5 个阶段执行：

## 阶段一：提取核心 CSS 变量 (Variables Extraction)
**目标**：消除硬编码的重复值，大幅减小代码量。
- 分析 `.theme-liquid` 中重复出现的 `backdrop-filter: blur(...)`、`box-shadow` 和复杂的线性渐变背景。
- 在 `.app.theme-liquid` 根节点定义诸如 `--liquid-blur`、`--liquid-glass-bg`、`--liquid-shadow` 等变量。
- 批量替换整个文件中硬编码的值。

## 阶段二：清理死代码与冗余覆盖 (Dead Code Elimination)
**目标**：解决“打补丁”式的代码冗余。
- 移除同名选择器被后续代码多次覆盖留下的“死代码”（例如 `.mikanGroupSidebar` 在文件不同位置被定义了 3 次以上的宽度和边距）。
- 梳理响应式断点 (`@media`)，合并相同屏幕宽度下的规则，防止逻辑碎片化。

## 阶段三：选择器聚合与简化 (Selector Optimization)
**目标**：消除巨型选择器列表，提高可读性和渲染性能。
- 识别例如 `50+` 个选择器用逗号分隔去实现 `background: transparent !important;` 的块。
- 利用现代 CSS 的 `:is()` 伪类聚合选择器（例如 `.theme-liquid :is(.posterCard, .modalContent, .statsPanel) { ... }`）。
- 或者通过更通用的 DOM 结构父类控制，减少具体子元素的样式重复定义。

## 阶段四：消除 `!important` 滥用 (Specificity Resolution)
**目标**：让 CSS 回归自然的层叠优先级，降低未来维护难度。
- 去除 80% 以上不必要的 `!important`。
- 通过合理的选择器权重（如使用 `.app.theme-liquid` 作为命名空间提升优先级）来自然覆盖基础样式。
- 确保所有的液态玻璃主题覆盖规则不再依赖 `!important` 就能生效。

## 阶段五：合并独立文件与最终验证 (Merge & Verify)
**目标**：统一入口并确保无视觉破坏。
- 将零散的 `tags_fix.css` (60行) 检查并合并入优化后的 `styles.css` 中，删除多余文件。
- 进行本地构建和类型检查。
- 使用 Vite 构建检查 CSS Minifier 是否还有无害/有害警告。

---
**预期成果**：
- `styles.css` 行数预计可减少 **30% - 40%**（减少 3000~4500 行）。
- `!important` 数量大幅降低。
- 样式渲染性能（页面切换、滚动）会有显著改善，减少重绘（Repaint）和重排（Reflow）的计算量。
