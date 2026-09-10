# Logic0+

一个在浏览器中运行的双机器人编程解谜游戏。

本项目游戏规则参考 [Minecraft Marketplace 上的 Logic](https://marketplace.minecraft.net/en-us/pdp?id=fbdf41c7-4d77-49db-a4d7-2cb3305118af)，游戏规则略有扩充。

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) 18 或更高版本

### 启动

```bash
npm start
```

打开 [http://localhost:4173](http://localhost:4173) 即可游玩。开发服务器也会提供本地存档 API。

### 测试

```bash
npm test
```

## 关卡与本地数据

- `levels/`：内置关卡
- `saves/`：自主保存的各自关卡的游玩进度
- `cleared/<关卡编号-名称>/`：该关卡的全部通关历史；相同的指令模块与背包状态只会保存一次

## 开发说明

`core.js` 负责规则、状态和模拟；`app.js` 仅负责呈现与输入。
