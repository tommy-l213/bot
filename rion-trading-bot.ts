#!/usr/bin/env node

import { AptosAccount, AptosClient, HexString } from "aptos";
import * as readline from "readline";

// 合约配置
const CONTRACT_ADDRESS = "0xb6c1dfaadf9fa19bdd4351122e64e20b44e9dac757a39fa12de7ee51fd2cde37";
const MODULE_NAME = "trade";
const FUNCTION_NAME = "swap_rion";
const APTOS_NODE_URL = "https://fullnode.mainnet.aptoslabs.com";
const MIN_GAS = 5000000; // 0.05 APT minimum gas requirement
const APT_DECIMALS = 8;
const RION_DECIMALS = 6;

// 颜色输出
const colors = {
  green: '\x1b[32m%s\x1b[0m',
  red: '\x1b[31m%s\x1b[0m',
  yellow: '\x1b[33m%s\x1b[0m',
  blue: '\x1b[34m%s\x1b[0m',
  cyan: '\x1b[36m%s\x1b[0m',
  white: '\x1b[37m%s\x1b[0m'
};

interface TradingStats {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalGasPaid: number;
  totalFeesPaid: number;
  hyperionFees: number; // Hyperion 池子手续费 (0.3%)
  totalVolumeAPT: number; // 总交易量 (APT)
  totalVolumeRION: number; // 总交易量 (RION)
  startTime: Date;
  startingBalance: number;
}

class RionTradingBot {
  private client: AptosClient;
  private account: AptosAccount | null = null;
  private rl: readline.Interface;
  private stats: TradingStats;
  private isRunning: boolean = false;
  private rionToAptRate: number = 0.08743; // 默认汇率，从API获取后更新

  constructor() {
    this.client = new AptosClient(APTOS_NODE_URL);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.stats = this.initStats();
  }

  private initStats(): TradingStats {
    return {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalGasPaid: 0,
      totalFeesPaid: 0,
      hyperionFees: 0,
      totalVolumeAPT: 0,
      totalVolumeRION: 0,
      startTime: new Date(),
      startingBalance: 0
    };
  }

  private question(query: string): Promise<string> {
    return new Promise(resolve => this.rl.question(query, resolve));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchRionPrice(): Promise<void> {
    try {
      this.log('🔍 获取 RION-APT 汇率...', 'blue');
      
      // 使用 Node.js 原生 fetch (Node 18+) 或者添加兼容性处理
      let response: any;
      let data: any;
      
      if (typeof fetch !== 'undefined') {
        // Node.js 18+ 原生 fetch
        response = await fetch('https://api.dexscreener.com/tokens/v1/aptos/0x435ad41e7b383cef98899c4e5a22c8dc88ab67b22f95e5663d6c6649298c3a9d');
        data = await response.json();
      } else {
        // 使用 Node.js https 模块的简单实现
        const https = require('https');
        data = await new Promise((resolve, reject) => {
          const req = https.get('https://api.dexscreener.com/tokens/v1/aptos/0x435ad41e7b383cef98899c4e5a22c8dc88ab67b22f95e5663d6c6649298c3a9d', (res: any) => {
            let body = '';
            res.on('data', (chunk: any) => body += chunk);
            res.on('end', () => {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(e);
              }
            });
          });
          req.on('error', reject);
          req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
          });
        });
      }
      
      if (data && data.length > 0 && data[0].priceNative) {
        this.rionToAptRate = parseFloat(data[0].priceNative);
        this.log(`📊 获取到汇率: 1 RION = ${this.rionToAptRate} APT`, 'green');
        this.log(`📊 反向汇率: 1 APT = ${(1 / this.rionToAptRate).toFixed(2)} RION`, 'green');
      } else {
        this.log('⚠️ 无法获取汇率，使用默认值', 'yellow');
      }
    } catch (error) {
      this.log(`❌ 获取汇率失败: ${error}，使用默认汇率`, 'red');
    }
  }

  private formatAPT(amount: number): string {
    return (amount / Math.pow(10, APT_DECIMALS)).toFixed(4);
  }

  private formatRION(amount: number): string {
    return (amount / Math.pow(10, RION_DECIMALS)).toFixed(2);
  }

  private log(message: string, color?: keyof typeof colors) {
    const timestamp = new Date().toLocaleTimeString();
    if (color && colors[color]) {
      console.log(colors[color], `[${timestamp}] ${message}`);
    } else {
      console.log(`[${timestamp}] ${message}`);
    }
  }

  private async getBalance(address: string): Promise<{apt: number, rion: number}> {
    // this.log(`🔍 正在查询地址 ${address} 的余额...`, 'blue');
    
    try {
      // 直接使用合约的 view 函数（因为 Aptos 已经切换到 Fungible Asset）
      // this.log('🔍 调用合约 view 函数获取余额...', 'blue');
      const result = await this.client.view({
        function: `${CONTRACT_ADDRESS}::${MODULE_NAME}::get_balance`,
        type_arguments: [],
        arguments: [address]
      });
      
      // this.log(`📦 合约返回原始数据: ${JSON.stringify(result)}`, 'blue');
      
      // 处理返回结果 - 可能是字符串或数字
      let aptBalance: number;
      let rionBalance: number;
      
      if (Array.isArray(result) && result.length >= 2) {
        // 尝试解析 APT 余额
        if (typeof result[0] === 'string') {
          aptBalance = parseInt(result[0]);
        } else if (typeof result[0] === 'number') {
          aptBalance = result[0];
        } else {
          aptBalance = Number(result[0]);
        }
        
        // 尝试解析 RION 余额
        if (typeof result[1] === 'string') {
          rionBalance = parseInt(result[1]);
        } else if (typeof result[1] === 'number') {
          rionBalance = result[1];
        } else {
          rionBalance = Number(result[1]);
        }
        
        // this.log(`💰 解析后 APT 余额: ${aptBalance} (${this.formatAPT(aptBalance)} APT)`, 'green');
        // this.log(`🪙 解析后 RION 余额: ${rionBalance}`, 'green');
        
        return { apt: aptBalance, rion: rionBalance };
      } else {
        throw new Error(`合约返回数据格式错误: ${JSON.stringify(result)}`);
      }
      
    } catch (error) {
      this.log(`❌ 合约 view 调用失败: ${error}`, 'red');
      
      // 回退到查找 Fungible Asset 资源
      try {
        this.log('🔄 回退到资源查询方法...', 'yellow');
        const resources = await this.client.getAccountResources(address);
        this.log(`📋 找到 ${resources.length} 个资源`, 'blue');
        
        // 查找 APT 的 PrimaryFungibleStore
        const aptStore = resources.find(
          (r) => r.type.includes('primary_fungible_store::PrimaryFungibleStore') ||
                r.type.includes('0x1::primary_fungible_store::PrimaryFungibleStore')
        );
        
        if (aptStore) {
          this.log(`🎯 找到 PrimaryFungibleStore: ${aptStore.type}`, 'green');
          this.log(`📊 资源数据: ${JSON.stringify((aptStore as any).data)}`, 'blue');
        }
        
        // 如果还是找不到，返回 0
        return { apt: 0, rion: 0 };
        
      } catch (fallbackError) {
        this.log(`❌ 回退方法也失败: ${fallbackError}`, 'red');
        throw new Error(`获取余额失败: ${error}`);
      }
    }
  }

  private async executeSwap(): Promise<boolean> {
    if (!this.account) {
      throw new Error("账户未初始化");
    }

    try {
      // 记录交易前余额
      const balancesBefore = await this.getBalance(this.account.address().hex());
      
      const payload = {
        function: `${CONTRACT_ADDRESS}::${MODULE_NAME}::${FUNCTION_NAME}`,
        type_arguments: [],
        arguments: []
      };

      const rawTxn = await this.client.generateTransaction(
        this.account.address(),
        payload,
        {
          max_gas_amount: "100000",
          gas_unit_price: "100"
        }
      );

      const signedTxn = await this.client.signTransaction(this.account, rawTxn);
      const response = await this.client.submitTransaction(signedTxn);
      
      await this.client.waitForTransaction(response.hash);
      
      // 记录交易后余额
      const balancesAfter = await this.getBalance(this.account.address().hex());
      
      // 计算这次交易使用的APT数量（交易前余额 - 5000000 units 保留）
      const availableAptForSwap = balancesBefore.apt - 5000000; // 5000000 units = 0.05 APT
      
      if (availableAptForSwap > 0) {
        // 一次 swap_rion 调用包含两次交换：
        // 1. APT -> RION 
        // 2. RION -> APT
        
        // 使用获取到的汇率计算 RION 数量
        // availableAptForSwap 是以 APT units 为单位的 (10^8 精度)
        const availableAptAmount = availableAptForSwap / Math.pow(10, APT_DECIMALS);
        const estimatedRionAmount = availableAptAmount / this.rionToAptRate; // 根据汇率计算RION数量 (实际RION)
        const estimatedRionUnits = estimatedRionAmount * Math.pow(10, RION_DECIMALS); // 转换为RION units (10^6 精度)
        
        // 统计交易量（两次交换都要统计）
        this.stats.totalVolumeAPT += availableAptForSwap; // APT->RION 的 APT 交易量 (以APT units计)
        this.stats.totalVolumeRION += estimatedRionUnits; // RION->APT 的 RION 交易量 (以RION units计)
        
        // 计算 Hyperion 手续费 (每次交换收取 0.3%)
        const aptToRionFee = availableAptForSwap * 0.003; // 第一次交换的手续费 (APT units)
        const rionToAptFee = estimatedRionUnits * 0.003; // 第二次交换的手续费 (RION units)
        // 将 RION 手续费转换为 APT 等值 (转换为APT units)
        const rionToAptFeeInRion = rionToAptFee / Math.pow(10, RION_DECIMALS); // 转换为实际RION
        const rionToAptFeeInApt = (rionToAptFeeInRion * this.rionToAptRate) * Math.pow(10, APT_DECIMALS); // 转换为APT units
        
        const totalHyperionFee = aptToRionFee + rionToAptFeeInApt;
        this.stats.hyperionFees += totalHyperionFee;
        
        this.log(`🔄 APT->RION 交易量: ${this.formatAPT(availableAptForSwap)} APT`, 'cyan');
        this.log(`🔄 RION->APT 交易量: ${this.formatRION(estimatedRionUnits)} RION`, 'cyan');
        this.log(`💸 Hyperion手续费: ${this.formatAPT(totalHyperionFee)} APT (双重0.3%)`, 'yellow');
        
      }
      
      // 获取交易详情以计算 Gas 费用
      const txnDetails = await this.client.getTransactionByHash(response.hash);
      const gasPaid = parseInt((txnDetails as any).gas_used) * parseInt((txnDetails as any).gas_unit_price);
      this.stats.totalGasPaid += gasPaid;

      this.log(`✅ 交易成功! Hash: ${response.hash}`, 'green');
      this.log(`⛽ Gas费用: ${this.formatAPT(gasPaid)} APT`, 'yellow');
      
      return true;
    } catch (error) {
      this.log(`❌ 交易失败: ${error}`, 'red');
      return false;
    }
  }

  private displayStats() {
    const currentTime = new Date();
    const runtime = Math.floor((currentTime.getTime() - this.stats.startTime.getTime()) / 1000);
    
    console.log('\n' + '='.repeat(70));
    console.log(colors.cyan, '📊 交易统计报告');
    console.log('='.repeat(70));
    
    // 基础统计
    console.log(`⏰ 运行时间: ${Math.floor(runtime / 3600)}h ${Math.floor((runtime % 3600) / 60)}m ${runtime % 60}s`);
    console.log(`📈 总交易次数: ${this.stats.totalTrades}`);
    console.log(`✅ 成功交易: ${this.stats.successfulTrades}`);
    console.log(`❌ 失败交易: ${this.stats.failedTrades}`);
    if (this.stats.totalTrades > 0) {
      console.log(`📊 成功率: ${((this.stats.successfulTrades / this.stats.totalTrades) * 100).toFixed(2)}%`);
    }
    
    console.log('');
    console.log(colors.yellow, '💹 交易量统计:');
    console.log(`🔄 总 APT 交易量: ${this.formatAPT(this.stats.totalVolumeAPT)} APT`);
    console.log(`🪙 总 RION 交易量: ${this.formatRION(this.stats.totalVolumeRION)} RION`);
    
    console.log('');
    console.log(colors.yellow, '💰 费用统计:');
    console.log(`⛽ 总Gas费用: ${this.formatAPT(this.stats.totalGasPaid)} APT`);
    console.log(`🏊 Hyperion池子手续费: ${this.formatAPT(this.stats.hyperionFees)} APT (0.3%)`);
    console.log(`💸 总费用成本: ${this.formatAPT(this.stats.totalGasPaid + this.stats.hyperionFees)} APT`);
    
    // 计算平均费用
    if (this.stats.successfulTrades > 0) {
      const avgGas = this.stats.totalGasPaid / this.stats.successfulTrades;
      const avgHyperionFee = this.stats.hyperionFees / this.stats.successfulTrades;
      console.log('');
      console.log(colors.cyan, '📊 平均费用统计:');
      console.log(`⛽ 平均Gas费用: ${this.formatAPT(avgGas)} APT/笔`);
      console.log(`🏊 平均Hyperion手续费: ${this.formatAPT(avgHyperionFee)} APT/笔`);
      console.log(`💸 平均总费用: ${this.formatAPT(avgGas + avgHyperionFee)} APT/笔`);
    }
    
    console.log('='.repeat(70) + '\n');
  }

  private async showWelcome() {
    console.clear();
    console.log(colors.cyan, '🤖 RION 自动交易机器人 v1.0');
    console.log(colors.cyan, '==========================\n');
    
    console.log('⚡ 功能说明:');
    console.log('• 自动执行 RION ↔ APT 交易');
    console.log('• 持续运行直到 APT 余额不足');
    console.log('• 实时显示交易状态和统计');
    console.log('• 支持随时停止 (Ctrl+C)\n');
    
    console.log(colors.yellow, '⚠️  重要提醒:');
    console.log(colors.yellow, '• 请确保钱包有足够的 APT 作为 Gas 费用');
    console.log(colors.yellow, `• 每次交易需要至少 ${this.formatAPT(MIN_GAS)} APT`);
    console.log(colors.yellow, '• 交易有风险，请谨慎操作\n');
  }

  private async setupAccount() {
    while (true) {
      try {
        const privateKey = await this.question('🔐 请输入您的私钥 (64位十六进制): ');
        
        // 处理私钥格式 - 支持带或不带 0x 前缀
        let cleanPrivateKey = privateKey.trim();
        if (cleanPrivateKey.startsWith('0x')) {
          cleanPrivateKey = cleanPrivateKey.slice(2);
        }
        
        if (!/^[0-9a-fA-F]{64}$/.test(cleanPrivateKey)) {
          this.log('❌ 私钥格式错误，请输入64位十六进制字符串（可带或不带0x前缀）', 'red');
          continue;
        }

        this.account = new AptosAccount(new HexString(cleanPrivateKey).toUint8Array());
        const address = this.account.address().hex();
        
        this.log(`🔍 验证账户: ${address}`, 'blue');
        
        const balances = await this.getBalance(address);
        this.stats.startingBalance = balances.apt;
        
        console.log(`💰 当前APT余额: ${this.formatAPT(balances.apt)} APT`);
        // console.log(`🪙 当前RION余额: ${balances.rion} RION`);
        
        if (balances.apt < MIN_GAS) {
          this.log(`❌ 余额不足！需要至少 ${this.formatAPT(MIN_GAS)} APT`, 'red');
          continue;
        }
        
        console.log(colors.green, '✅ 账户验证成功！\n');
        break;
        
      } catch (error) {
        this.log(`❌ 账户验证失败: ${error}`, 'red');
      }
    }
  }

  private async confirmStart() {
    console.log(colors.yellow, '⚠️  最后确认:');
    console.log('即将开始自动交易，程序将持续运行直到:');
    console.log('• APT 余额不足以支付 Gas 费用');
    console.log('• 手动停止程序 (Ctrl+C)');
    console.log('• 发生不可恢复的错误\n');
    
    const confirm = await this.question('确认开始交易吗？(输入 "yes" 确认): ');
    return confirm.toLowerCase() === 'yes';
  }

  private setupSignalHandlers() {
    process.on('SIGINT', async () => {
      this.log('\n🛑 收到停止信号，正在安全关闭...', 'yellow');
      this.isRunning = false;
      
      // 等待当前交易完成
      await this.sleep(2000);
      
      this.displayStats();
      this.log('👋 程序已安全退出', 'blue');
      process.exit(0);
    });
  }

  public async start() {
    try {
      await this.showWelcome();
      await this.fetchRionPrice(); // 获取汇率
      await this.setupAccount();
      
      const confirmed = await this.confirmStart();
      if (!confirmed) {
        this.log('🚫 用户取消操作', 'yellow');
        return;
      }

      this.setupSignalHandlers();
      this.isRunning = true;
      
      this.log('🚀 开始自动交易...', 'green');
      this.log('按 Ctrl+C 停止程序\n', 'blue');

      let consecutiveFailures = 0;
      const maxConsecutiveFailures = 3;

      while (this.isRunning) {
        try {
          if (!this.account) break;
          
          const balances = await this.getBalance(this.account.address().hex());
          
          if (balances.apt < MIN_GAS) {
            this.log(`💸 APT余额不足 (${this.formatAPT(balances.apt)} APT < ${this.formatAPT(MIN_GAS)} APT)`, 'red');
            this.log('🏁 自动交易结束', 'yellow');
            break;
          }

          this.log(`💰 当前APT余额: ${this.formatAPT(balances.apt)} APT`, 'blue');
          // this.log(`🪙 当前RION余额: ${balances.rion} RION`, 'cyan');
          this.log(`🔄 执行第 ${this.stats.totalTrades + 1} 笔交易...`, 'cyan');
          
          this.stats.totalTrades++;
          const success = await this.executeSwap();
          
          if (success) {
            this.stats.successfulTrades++;
            consecutiveFailures = 0;
            
            // 显示累计手续费统计
            this.log(`📊 累计Hyperion手续费: ${this.formatAPT(this.stats.hyperionFees)} APT`, 'green');
            this.log(`💸 累计总费用: ${this.formatAPT(this.stats.totalGasPaid + this.stats.hyperionFees)} APT`, 'yellow');
          } else {
            this.stats.failedTrades++;
            consecutiveFailures++;
            
            if (consecutiveFailures >= maxConsecutiveFailures) {
              this.log(`❌ 连续 ${maxConsecutiveFailures} 次交易失败，程序停止`, 'red');
              break;
            }
          }

          // 每10笔交易显示一次统计
          if (this.stats.totalTrades % 10 === 0) {
            this.displayStats();
          }

          // 交易间隔
          this.log('⏳ 等待 3 秒后继续下一笔交易...\n', 'white');
          await this.sleep(3000);
          
        } catch (error) {
          this.log(`❌ 发生错误: ${error}`, 'red');
          consecutiveFailures++;
          
          if (consecutiveFailures >= maxConsecutiveFailures) {
            this.log('❌ 错误过多，程序停止', 'red');
            break;
          }
          
          await this.sleep(5000);
        }
      }

      this.displayStats();
      this.log('🎯 交易会话结束', 'blue');
      
    } catch (error) {
      this.log(`💥 程序发生致命错误: ${error}`, 'red');
    } finally {
      this.rl.close();
    }
  }
}

// 启动程序
if (require.main === module) {
  const bot = new RionTradingBot();
  bot.start().catch(console.error);
}

export default RionTradingBot;