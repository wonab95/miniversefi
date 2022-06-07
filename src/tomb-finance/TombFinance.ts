// import { Fetcher, Route, Token } from '@uniswap/sdk';
import { Fetcher as FetcherSpirit, Token as TokenSpirit } from '@spiritswap/sdk';
import { Fetcher, Route, Token } from '@spookyswap/sdk';
import { Configuration } from './config';
import { ContractName, TokenStat, AllocationTime, LPStat, Bank, PoolStats, TShareSwapperStat } from './types';
import { BigNumber, Contract, ethers, EventFilter } from 'ethers';
import { decimalToBalance } from './ether-utils';
import { TransactionResponse } from '@ethersproject/providers';
import ERC20 from './ERC20';
import { getFullDisplayBalance, getDisplayBalance } from '../utils/formatBalance';
import { getDefaultProvider } from '../utils/provider';
import IUniswapV2PairABI from './IUniswapV2Pair.abi.json';
import config, { bankDefinitions } from '../config';


import moment from 'moment';
import { parseUnits } from 'ethers/lib/utils';
import { FTM_TICKER, SPOOKY_ROUTER_ADDR, TOMB_TICKER } from '../utils/constants';
/**
 * An API module of 2omb Finance contracts.
 * All contract-interacting domain logic should be defined in here.
 */
export class TombFinance {
  myAccount: string;
  provider: ethers.providers.Web3Provider;
  signer?: ethers.Signer;
  config: Configuration;
  contracts: { [name: string]: Contract };
  externalTokens: { [name: string]: ERC20 };
  masonryVersionOfUser?: string;

  TOMBWFTM_LP: Contract;
  TOMB: ERC20;
  TSHARE: ERC20;
  TBOND: ERC20;
  FTM: ERC20;
  USDC: ERC20;

  constructor(cfg: Configuration) {
    const { deployments, externalTokens } = cfg;
    const provider = getDefaultProvider();

    // loads contracts from deployments
    this.contracts = {};
    for (const [name, deployment] of Object.entries(deployments)) {
      this.contracts[name] = new Contract(deployment.address, deployment.abi, provider);
    }
    this.externalTokens = {};
    for (const [symbol, [address, decimal]] of Object.entries(externalTokens)) {
      this.externalTokens[symbol] = new ERC20(address, provider, symbol, decimal);
    }
    this.TOMB = new ERC20(deployments.tomb.address, provider, 'MvDOLLAR');
    this.TSHARE = new ERC20(deployments.tShare.address, provider, 'MSHARE');
    this.TBOND = new ERC20(deployments.tBond.address, provider, 'MvBOND');
    this.FTM = this.externalTokens['WFTM'];
    this.USDC = this.externalTokens['USDC'];
    // Uniswap V2 Pair
    this.TOMBWFTM_LP = new Contract(externalTokens['MVDOLLAR-USDC-LP'][0], IUniswapV2PairABI, provider);

    this.config = cfg;
    this.provider = provider;
  }

  /**
   * @param provider From an unlocked wallet. (e.g. Metamask)
   * @param account An address of unlocked wallet account.
   */
  unlockWallet(provider: any, account: string) {
    const newProvider = new ethers.providers.Web3Provider(provider, this.config.chainId);
    this.signer = newProvider.getSigner(0);
    this.myAccount = account;
    for (const [name, contract] of Object.entries(this.contracts)) {
      this.contracts[name] = contract.connect(this.signer);
    }
    const tokens = [this.TOMB, this.TSHARE, this.TBOND, ...Object.values(this.externalTokens)];
    for (const token of tokens) {
      token.connect(this.signer);
    }
    this.TOMBWFTM_LP = this.TOMBWFTM_LP.connect(this.signer);
    console.log(`🔓 Wallet is unlocked. Welcome, ${account}!`);
    this.fetchMasonryVersionOfUser()
      .then((version) => (this.masonryVersionOfUser = version))
      .catch((err) => {
        console.error(`Failed to fetch masonry version: ${err.stack}`);
        this.masonryVersionOfUser = 'latest';
      });
  }

  get isUnlocked(): boolean {
    return !!this.myAccount;
  }

  //===================================================================
  //===================== GET ASSET STATS =============================
  //===================FROM SPOOKY TO DISPLAY =========================
  //=========================IN HOME PAGE==============================
  //===================================================================

  async getTombStat(): Promise<TokenStat> {
    const { LPRewardPool} = this.contracts;
    const supply = await this.TOMB.totalSupply();
    const tombRewardPoolSupply = await this.TOMB.balanceOf(LPRewardPool.address); 
    const tombRewardPoolSupply2 = await this.TOMB.balanceOf('0xda2a4abc17a87f6f7b532a37ab8b707343a97334');
    const tombRewardPoolSupply3 = await this.TOMB.balanceOf('0x4c5b4f27bc268594ecacc3dfce68ad70bd21487c');
    const tombRewardPoolSupply4 = await this.TOMB.balanceOf('0x78ee91ea69132e5838699c42f0c07fa98da90161');
    const tombCirculatingSupply = supply
      .sub(tombRewardPoolSupply)
      .sub(tombRewardPoolSupply2)
      .sub(tombRewardPoolSupply3)
      .sub(tombRewardPoolSupply4)
   

    const priceInFTM = await this.getTokenPriceFromPancakeswapUSDC(this.TOMB);

    const priceOfOneFTM = await this.getWFTMPriceFromPancakeswap();
    const priceOfTombInDollars = (Number(priceInFTM) * Number(priceOfOneFTM)).toFixed(2);
  
    return {
      tokenInFtm: priceInFTM,
      priceInDollars: priceInFTM,
      totalSupply: getDisplayBalance(supply, this.TOMB.decimal, 0),
      circulatingSupply: getDisplayBalance(tombCirculatingSupply, this.TOMB.decimal, 0),
    };
  }

  /**
   * Calculates various stats for the requested LP
   * @param name of the LP token to load stats for
   * @returns
   */
  async getLPStat(name: string): Promise<LPStat> {
    const lpToken = this.externalTokens[name];

    const lpTokenSupplyBN = await lpToken.totalSupply();

    const lpTokenSupply = getDisplayBalance(lpTokenSupplyBN, 18);
    
    const token0 = name.startsWith('MVDOLLAR') ? this.TOMB : this.TSHARE;
    
    const isTomb = name.startsWith('MVDOLLAR');
    const tokenAmountBN = await token0.balanceOf(lpToken.address);
    
    const tokenAmount = getDisplayBalance(tokenAmountBN, 18);
    
    const ftmAmountBN = await this.USDC.balanceOf(lpToken.address);
    
    const ftmAmount = getDisplayBalance(ftmAmountBN, 6);
    
    const tokenAmountInOneLP = Number(tokenAmount) / Number(lpTokenSupply);
    const ftmAmountInOneLP = Number(ftmAmount) / Number(lpTokenSupply);
    const lpTokenPrice = await this.getLPTokenPrice(lpToken, token0, isTomb);
    const lpTokenPriceFixed = Number(lpTokenPrice).toFixed(2).toString();
    const liquidity = (Number(lpTokenSupply) * Number(lpTokenPrice)).toFixed(2).toString();
    return {
      tokenAmount: tokenAmountInOneLP.toFixed(2).toString(),
      ftmAmount: ftmAmountInOneLP.toFixed(2).toString(),
      priceOfOne: lpTokenPriceFixed,
      totalLiquidity: liquidity,
      totalSupply: Number(lpTokenSupply).toFixed(6).toString(),
    };
  }

  /**
   * Use this method to get price for Tomb
   * @returns TokenStat for TBOND
   * priceInFTM
   * priceInDollars
   * TotalSupply
   * CirculatingSupply (always equal to total supply for bonds)
   */
  async getBondStat(): Promise<TokenStat> {
    const { Treasury } = this.contracts;
    const tombStat = await this.getTombStat();
    const bondTombRatioBN = await Treasury.getBondPremiumRate();

    const modifier = bondTombRatioBN / 1e18 > 1 ? bondTombRatioBN / 1e18 : 1;
    const bondPriceInFTM = (Number(tombStat.tokenInFtm) * modifier).toFixed(2);
    const priceOfTBondInDollars = (Number(tombStat.priceInDollars) * modifier).toFixed(2);
    const supply = await this.TBOND.displayedTotalSupply();
    return {
      tokenInFtm: bondPriceInFTM,
      priceInDollars: priceOfTBondInDollars,
      totalSupply: supply,
      circulatingSupply: supply,
    };
  }

  /**
   * @returns TokenStat for TSHARE
   * priceInFTM
   * priceInDollars
   * TotalSupply
   * CirculatingSupply (always equal to total supply for bonds)
   */
  async getShareStat(): Promise<TokenStat> {
    const { LPRewardPool1ShareRewardPool } = this.contracts;

    const supply = await this.TSHARE.totalSupply();

    const priceInFTM = await this.getTokenPriceFromPancakeswapUSDC(this.TSHARE);
    
    const tombRewardPoolSupply = await this.TSHARE.balanceOf(LPRewardPool1ShareRewardPool.address);
    
    const tShareRewardPoolSupply1 = await this.TSHARE.balanceOf('0x78ee91ea69132e5838699c42f0c07fa98da90161');
    const tShareCirculatingSupply = supply
      .sub(tShareRewardPoolSupply1)
      .sub(tombRewardPoolSupply)

    const priceOfOneFTM = await this.getWFTMPriceFromPancakeswap();
    const priceOfSharesInDollars = (Number(priceInFTM) * Number(priceOfOneFTM)).toFixed(2);

    const circ = (Number(tShareCirculatingSupply)/1e18).toString();
    return {
      tokenInFtm: priceInFTM,
      priceInDollars: priceInFTM,
      totalSupply: getDisplayBalance(supply, this.TSHARE.decimal, 0),
      circulatingSupply: getDisplayBalance(tShareCirculatingSupply, this.TSHARE.decimal, 0),
    };
  }

  async getTombStatInEstimatedTWAP(): Promise<TokenStat> {
    const { SeigniorageOracle, TombFtmRewardPool } = this.contracts;
    const expectedPrice = await SeigniorageOracle.twap(this.TOMB.address, ethers.utils.parseEther('1'));
    
    const supply = await this.TOMB.totalSupply();
    
    const tombRewardPoolSupply = await this.TOMB.balanceOf(TombFtmRewardPool.address);
    
    const tombCirculatingSupply = supply.sub(tombRewardPoolSupply);
   
    const price = (Number(expectedPrice)/1e18).toString();
    return {
      tokenInFtm: price,
      priceInDollars: price,
      totalSupply: getDisplayBalance(supply, this.TOMB.decimal, 0),
      circulatingSupply: getDisplayBalance(tombCirculatingSupply, this.TOMB.decimal, 0),
    };
  }

  async getTombPriceInLastTWAP(): Promise<BigNumber> {
    const { Treasury } = this.contracts;
    return Treasury.getMvDOLLARUpdatedPrice();
  }

  async getBondsPurchasable(): Promise<BigNumber> {
    const { Treasury } = this.contracts;
    return Treasury.getBurnableMvDOLLARLeft();
  }

  async sendDollar(amount: string | number, recepient: string): Promise<TransactionResponse> {
    const {tomb} = this.contracts;
    
    return await tomb.transfer(recepient, decimalToBalance(amount));
  }

  async getRaffleStat(account: string, raffleAddress: string): Promise<TokenStat> {
    let total = 0;
    const {tomb} = this.contracts;

    const priceInBTC = await this.getTokenPriceFromPancakeswapUSDC(this.TOMB);

    const balOfRaffle = await tomb.balanceOf(raffleAddress);

    const currentBlockNumber = await this.provider.getBlockNumber();

    const filterTo = tomb.filters.Transfer(account, raffleAddress);

    const startBlock = currentBlockNumber-100000;

    let allEvents : any = [];
    
    for(let i = startBlock; i < currentBlockNumber; i += 2000) {
      const _startBlock = i;
      const _endBlock = Math.min(currentBlockNumber, i + 1999);
      const events = await tomb.queryFilter(filterTo, _startBlock, _endBlock);
      allEvents = [...allEvents, ...events]
    }


    if (allEvents.length !== 0 && account !== null) {
      for (let i = 0; i < allEvents.length; i++) {
        total = total + Number(allEvents[i].args.value);
      }
      total = total / 1e18;
    } else {
      total = 0;
    }

    return {
      tokenInFtm: priceInBTC.toString(),
      priceInDollars: total.toString(),
      totalSupply: getDisplayBalance(balOfRaffle, 18, 0),
      circulatingSupply: raffleAddress.toString(),
    };
  }

  /**
   * Calculates the TVL, APR and daily APR of a provided pool/bank
   * @param bank
   * @returns
   */
  async getPoolAPRs(bank: Bank): Promise<PoolStats> {
    if (this.myAccount === undefined) return;
    const depositToken = bank.depositToken;

    const poolContract = this.contracts[bank.contract];

    if (bank.sectionInUI === 3) {
        const [depositTokenPrice, points, totalPoints, tierAmount, poolBalance, totalBalance, dripRate, dailyUserDrip] = await Promise.all([
          this.getDepositTokenPriceInDollars(bank.depositTokenName, depositToken),
          poolContract.tierAllocPoints(bank.poolId),
          poolContract.totalAllocPoints(),
          poolContract.tierAmounts(bank.poolId),
          poolContract.getBalancePool(),
          depositToken.balanceOf(bank.address),
          poolContract.dripRate(),
          poolContract.getDayDripEstimate(this.myAccount),
        ]);
        const stakeAmount = Number(getDisplayBalance(tierAmount))
  
        const dailyDrip = totalPoints && +totalPoints > 0 
          ? getDisplayBalance(poolBalance.mul(BigNumber.from(86400)).mul(points).div(totalPoints).div(dripRate)) 
          : 0;
        const dailyDripAPR = (Number(dailyDrip) / stakeAmount) * 100;
        const yearlyDripAPR = (Number(dailyDrip) * 365 / stakeAmount) * 100;
        
        const dailyDripUser = Number(getDisplayBalance(dailyUserDrip));
        const yearlyDripUser = Number(dailyDripUser) * 365;
  
        
        const TVL = Number(depositTokenPrice) * Number(getDisplayBalance(totalBalance, depositToken.decimal));
  
        return {
          userDailyBurst: dailyDripUser.toFixed(2).toString(),
          userYearlyBurst: yearlyDripUser.toFixed(2).toString(),
          dailyAPR: dailyDripAPR.toFixed(2).toString(),
          yearlyAPR: yearlyDripAPR.toFixed(2).toString(),
          TVL: TVL.toFixed(2).toString(),
        };
    } else {
    const depositTokenPrice = await this.getDepositTokenPriceInDollars(bank.depositTokenName, depositToken);

    const stakeInPool = await depositToken.balanceOf(bank.address);
    
    const TVL = Number(depositTokenPrice) * Number(getDisplayBalance(stakeInPool, depositToken.decimal));
    
    const stat = bank.earnTokenName === 'MvDOLLAR' ? await this.getTombStat() : await this.getShareStat();
    const tokenPerSecond = await this.getTokenPerSecond(
      bank.earnTokenName,
      bank.contract,
      poolContract,
      bank.depositTokenName,
    );
    
    const tokenPerHour = tokenPerSecond.mul(60).mul(60);
    const totalRewardPricePerYear =
      Number(stat.priceInDollars) * Number(getDisplayBalance(tokenPerHour.mul(24).mul(365)));
      

    const totalRewardPricePerDay = Number(stat.priceInDollars) * Number(getDisplayBalance(tokenPerHour.mul(24)));
    const totalStakingTokenInPool =
      Number(depositTokenPrice) * Number(getDisplayBalance(stakeInPool, depositToken.decimal));
    const dailyAPR = (totalRewardPricePerDay / totalStakingTokenInPool) * 100;
    const yearlyAPR = (totalRewardPricePerYear / totalStakingTokenInPool) * 100;
    return {
      dailyAPR: dailyAPR.toFixed(2).toString(),
      yearlyAPR: yearlyAPR.toFixed(2).toString(),
      TVL: TVL.toFixed(2).toString(),
    };
  }
  }
  /**
   * Method to return the amount of tokens the pool yields per second
   * @param earnTokenName the name of the token that the pool is earning
   * @param contractName the contract of the pool/bank
   * @param poolContract the actual contract of the pool
   * @returns
   */
  async getTokenPerSecond(
    earnTokenName: string,
    contractName: string,
    poolContract: Contract,
    depositTokenName: string,
  ) {
    if (earnTokenName === 'MvDOLLAR') {
      if (!contractName.endsWith('ShareRewardPool')) {
        const rewardPerSecond = (await poolContract.MvDOLLARPerSecond());
        if (depositTokenName === 'WFTM') {
          return rewardPerSecond.mul(430).div(4269);
        } else if (depositTokenName === 'MVDOLLAR-USDC-LP') {
          return rewardPerSecond.mul(3244).div(4269); 
        } else if (depositTokenName === 'FANG') {
          return rewardPerSecond.mul(171).div(4269); 
        } else if (depositTokenName === 'USDC') {
          return rewardPerSecond.mul(430).div(4269); 
        }
        return rewardPerSecond.div(24);
      }
      const poolStartTime = await poolContract.poolStartTime();
      const startDateTime = new Date(poolStartTime.toNumber() * 1000);
      const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000;
      if (Date.now() - startDateTime.getTime() > FOUR_DAYS) {
        return await poolContract.epochTombPerSecond(1);
      }
      return await poolContract.epochTombPerSecond(0);
    }
    const rewardPerSecond = await poolContract.MvSHAREPerSecond();
    if (depositTokenName.startsWith('MVDOLLAR-USDC')) {
      return rewardPerSecond.mul(9500).div(41000);
    } else if (depositTokenName.startsWith('MSHARE-USDC')) {
      return rewardPerSecond.mul(1450).div(41000);
    }else if (depositTokenName.startsWith('MVDOLLAR-MSHARE-LP')) {
      return rewardPerSecond.mul(50).div(41000);
    }else {
      return rewardPerSecond.mul(30000).div(41000)
    }
  }

  /**
   * Method to calculate the tokenPrice of the deposited asset in a pool/bank
   * If the deposited token is an LP it will find the price of its pieces
   * @param tokenName
   * @param pool
   * @param token
   * @returns
   */
  async getDepositTokenPriceInDollars(tokenName: string, token: ERC20) {
    let tokenPrice;
    const priceOfOneFtmInDollars = await this.getWFTMPriceFromPancakeswap();
    if (tokenName === 'WFTM') {
      tokenPrice = priceOfOneFtmInDollars;
    } else {
      if (tokenName === '2OMB-FTM-LP') {
        tokenPrice = await this.getLPTokenPrice(token, this.TOMB, true);
      } else if (tokenName === 'MSHARE-USDC-LP') {
        tokenPrice = await this.getLPTokenPrice(token, this.TSHARE, false);
      } else if (tokenName === "MVDOLLAR-USDC-LP") {
        tokenPrice = await this.getLPTokenPrice(token, this.TOMB, true);
      }else if (tokenName === "MVDOLLAR-MSHARE-LP") {
        tokenPrice = await this.getLPTokenPrice(token, this.TOMB, true);
      }else if (tokenName === 'USDC') {
        tokenPrice = '1';
      }else if (tokenName === 'MSHARE') {
        const price = await this.getShareStat();
        tokenPrice = price.priceInDollars;
      }else if (tokenName === 'MvDOLLAR') {
        const price = await this.getTombStat();
        tokenPrice = price.priceInDollars;
      } else {
        tokenPrice = await this.getTokenPriceFromPancakeswap(token);
        tokenPrice = (Number(tokenPrice) * Number(priceOfOneFtmInDollars)).toString();
      }
    }
    return tokenPrice;
  }

  //===================================================================
  //===================== GET ASSET STATS =============================
  //=========================== END ===================================
  //===================================================================

  async getCurrentEpoch(): Promise<BigNumber> {
    const { Treasury } = this.contracts;
    return Treasury.epoch();
  }

  async getBondOraclePriceInLastTWAP(): Promise<BigNumber> {
    const { Treasury } = this.contracts;
    return Treasury.getBondPremiumRate();
  }

  /**
   * Buy bonds with cash.
   * @param amount amount of cash to purchase bonds with.
   */
  async buyBonds(amount: string | number): Promise<TransactionResponse> {
    const { Treasury } = this.contracts;
    const treasuryTombPrice = await Treasury.getMvDOLLARPrice();
    return await Treasury.buyBonds(decimalToBalance(amount), treasuryTombPrice);
  }

  /**
   * Redeem bonds for cash.
   * @param amount amount of bonds to redeem.
   */
  async redeemBonds(amount: string): Promise<TransactionResponse> {
    const { Treasury } = this.contracts;
    const priceForTomb = await Treasury.getMvDOLLARPrice();
    return await Treasury.redeemBonds(decimalToBalance(amount), priceForTomb);
  }

  // async getTotalValueLocked(): Promise<Number> {
    
  //   let totalValue = 0;
  //   for (const bankInfo of Object.values(bankDefinitions)) {
  //     const pool = this.contracts[bankInfo.contract];
  //     const token = this.externalTokens[bankInfo.depositTokenName];
  //     const tokenPrice = await this.getDepositTokenPriceInDollars(bankInfo.depositTokenName, token);
  //     const tokenAmountInPool = await token.balanceOf(pool.address);
  //     const value = Number(getDisplayBalance(tokenAmountInPool, token.decimal)) * Number(tokenPrice);
  //     const poolValue = Number.isNaN(value) ? 0 : value;
  //     totalValue += poolValue;
  //   }

  //   return totalValue;
  // }

  async getTotalValueLocked(): Promise<Number> {
    let totalValue = 0;
    for (const bankInfo of Object.values(bankDefinitions)) {
      const pool = this.contracts[bankInfo.contract];
      const token = this.externalTokens[bankInfo.depositTokenName];
      const tokenPrice = await this.getDepositTokenPriceInDollars(bankInfo.depositTokenName, token);
      const tokenAmountInPool = await token.balanceOf(pool.address);
      const value = Number(getDisplayBalance(tokenAmountInPool, token.decimal)) * Number(tokenPrice);
      const poolValue = Number.isNaN(value) ? 0 : value;
      totalValue += poolValue;
    }

    const TSHAREPrice = (await this.getShareStat()).priceInDollars;
    const masonrytShareBalanceOf = await this.TSHARE.balanceOf(this.currentMasonry().address);
    const masonryTVL = Number(getDisplayBalance(masonrytShareBalanceOf, this.TSHARE.decimal)) * Number(TSHAREPrice);

    return totalValue + masonryTVL;
  }

  /**
   * Calculates the price of an LP token
   * Reference https://github.com/DefiDebauchery/discordpricebot/blob/4da3cdb57016df108ad2d0bb0c91cd8dd5f9d834/pricebot/pricebot.py#L150
   * @param lpToken the token under calculation
   * @param token the token pair used as reference (the other one would be FTM in most cases)
   * @param isTomb sanity check for usage of tomb token or tShare
   * @returns price of the LP token
   */
  async getLPTokenPrice(lpToken: ERC20, token: ERC20, isTomb: boolean): Promise<string> {
    const totalSupply = getFullDisplayBalance(await lpToken.totalSupply(), lpToken.decimal);
  
    //Get amount of tokenA
    const tokenSupply = getFullDisplayBalance(await token.balanceOf(lpToken.address), token.decimal);
    const stat = isTomb === true ? await this.getTombStat() : await this.getShareStat();
    const priceOfToken = stat.priceInDollars;
    const tokenInLP = Number(tokenSupply) / Number(totalSupply);
    const tokenPrice = (Number(priceOfToken) * tokenInLP * 2) //We multiply by 2 since half the price of the lp token is the price of each piece of the pair. So twice gives the total
      .toString();
    return tokenPrice;
  }

  async earnedFromBank(
    poolName: ContractName,
    earnTokenName: String,
    poolId: Number,
    account = this.myAccount,
  ): Promise<BigNumber> {
    const pool = this.contracts[poolName];
    try {
      if (earnTokenName === 'MSHARE' && poolName.includes('Node')) {
        return await pool.getTotalRewards(account);
      }
      if (earnTokenName === 'MvDOLLAR') {
        return await pool.pendingMvDOLLAR(poolId, account);
      } else {
        return await pool.pendingShare(poolId, account);
      }
    } catch (err) {
      console.error(`Failed to call earned() on pool ${pool.address}`);
      return BigNumber.from(0);
    }
  }

  async stakedBalanceOnBank(poolName: ContractName, poolId: Number, account = this.myAccount): Promise<BigNumber> {
    const pool = this.contracts[poolName];
    try {
      let userInfo = await pool.userInfo(poolId, account);
      return await userInfo.amount;
    } catch (err) {
      console.error(`Failed to call balanceOf() on pool ${pool.address}`);
      return BigNumber.from(0);
    }
  }
  async claimedBalanceNode(poolName: ContractName, account = this.myAccount): Promise<BigNumber> {
    const pool = this.contracts[poolName];
    try {
      let userInfo = await pool.users(account);
      return await userInfo.total_claims;
    } catch (err) {
      console.error(`Failed to call userInfo() on pool ${pool.address}: ${err}`);
      return BigNumber.from(0);
    }
  }
  
  async getNodePrice(poolName: ContractName, poolId: Number): Promise<BigNumber> {
    const pool = this.contracts[poolName];
    try {
      return await pool.tierAmounts(poolId);
    } catch (err) {
      console.error(`Failed to call tierAmounts on contract ${pool.address}: ${err}`);
      return BigNumber.from(0);
    }
  }
  /**
   * Deposits token to given pool.
   * @param poolName A name of pool contract.
   * @param amount Number of tokens with decimals applied. (e.g. 1.45 DAI * 10^18)
   * @returns {string} Transaction hash
   */
   async stake(poolName: ContractName, poolId: Number, sectionInUI: Number, amount: BigNumber): Promise<TransactionResponse> {
    const pool = this.contracts[poolName];

    return sectionInUI !== 3 
      ? await pool.deposit(poolId, amount)
      : await pool.create(poolId, amount);
  }

  async setTierValues(poolName: ContractName): Promise<TransactionResponse> {
    const pool = this.contracts[poolName];
    console.log([BigNumber.from('1000000000000000000')], [BigNumber.from('5000000000000000000')]);
    return await pool.setTierValues(
      [BigNumber.from('1000000000000000000')], [BigNumber.from('5000000000000000000')]
    );
  }
  
  async getTierValues(poolName: ContractName): Promise<void> {
    const pool = this.contracts[poolName];

    console.log(await pool.tierAmounts(0), await pool.tierAllocPoints(0));
  }

  /**
   * Withdraws token from given pool.
   * @param poolName A name of pool contract.
   * @param amount Number of tokens with decimals applied. (e.g. 1.45 DAI * 10^18)
   * @returns {string} Transaction hash
   */
  async unstake(poolName: ContractName, poolId: Number, amount: BigNumber): Promise<TransactionResponse> {
    const pool = this.contracts[poolName];
    return await pool.withdraw(poolId, amount);
  }

  /**
   * Transfers earned token reward from given pool to my account.
   */
   async harvest(poolName: ContractName, poolId: Number, sectionInUI: Number): Promise<TransactionResponse> {
    const pool = this.contracts[poolName];
    //By passing 0 as the amount, we are asking the contract to only redeem the reward and not the currently staked token
    return sectionInUI !== 3
    ? await pool.withdraw(poolId, 0)
    : await pool.claim();
  }

  async compound(poolName: ContractName, poolId: Number, sectionInUI: Number): Promise<TransactionResponse> {
    const pool = this.contracts[poolName];
    //By passing 0 as the amount, we are asking the contract to only redeem the reward and not the currently staked token
    return sectionInUI !== 3
    ? await pool.withdraw(poolId, 0)
    : await pool.compound();
  }

  async getNodes(contract: string, user: string): Promise<BigNumber[]> {
    return await this.contracts[contract].getNodes(user);
  }

  async getMaxPayout(contract: string, user: string): Promise<BigNumber[]> {
    return await this.contracts[contract].maxPayout(user);
  }

  async getUserDetails(contract: string, user: string): Promise<BigNumber[]> {
    return await this.contracts[contract].users(user);
  }
  
  async getTotalNodes(contract: string): Promise<BigNumber[]> {
    return await this.contracts[contract].getTotalNodes();
  }

  /**
   * Harvests and withdraws deposited tokens from the pool.
   */
  async exit(poolName: ContractName, poolId: Number, account = this.myAccount): Promise<TransactionResponse> {
    const pool = this.contracts[poolName];
    let userInfo = await pool.userInfo(poolId, account);
    return await pool.withdraw(poolId, userInfo.amount);
  }

  async fetchMasonryVersionOfUser(): Promise<string> {
    return 'latest';
  }

  currentMasonry(): Contract {
    
    return this.contracts.Masonry;
  }

  isOldMasonryMember(): boolean {
    return this.masonryVersionOfUser !== 'latest';
  }

  async getTokenPriceFromPancakeswap(tokenContract: ERC20): Promise<string> {
    const ready = await this.provider.ready;
    if (!ready) return;
    const { chainId } = this.config;
    const { WFTM } = this.config.externalTokens;

    const wftm = new Token(chainId, WFTM[0], WFTM[1]);
    const token = new Token(chainId, tokenContract.address, tokenContract.decimal, tokenContract.symbol);
    
    try {
      const wftmToToken = await Fetcher.fetchPairData(wftm, token, this.provider);
      
      const priceInBUSD = new Route([wftmToToken], token);


      return priceInBUSD.midPrice.toFixed(4);
    } catch (err) {
      console.error(`Failed to fetch token price of ${tokenContract.symbol}: ${err}`);
    }
  }

  async getTokenPriceFromPancakeswapUSDC(tokenContract: ERC20): Promise<string> {
    const ready = await this.provider.ready;
    if (!ready) return;
    const { chainId } = this.config;
    const { USDC } = this.config.externalTokens;

    const wftm = new Token(chainId, USDC[0], USDC[1]);
    const token = new Token(chainId, tokenContract.address, tokenContract.decimal, tokenContract.symbol);

    try {
      const wftmToToken = await Fetcher.fetchPairData(wftm, token, this.provider);
  
      const priceInBUSD = new Route([wftmToToken], token);
  

      return priceInBUSD.midPrice.toFixed(4);
    } catch (err) {
      console.error(`Failed to fetch token price of ${tokenContract.symbol}: ${err}`);
    }
  }

  async getTokenPriceFromSpiritswap(tokenContract: ERC20): Promise<string> {
    const ready = await this.provider.ready;
    if (!ready) return;
    const { chainId } = this.config;

    const { WFTM } = this.externalTokens;

    const wftm = new TokenSpirit(chainId, WFTM.address, WFTM.decimal);
    const token = new TokenSpirit(chainId, tokenContract.address, tokenContract.decimal, tokenContract.symbol);
    try {
      const wftmToToken = await FetcherSpirit.fetchPairData(wftm, token, this.provider);
      const liquidityToken = wftmToToken.liquidityToken;
      let ftmBalanceInLP = await WFTM.balanceOf(liquidityToken.address);
      let ftmAmount = Number(getFullDisplayBalance(ftmBalanceInLP, WFTM.decimal));
      let shibaBalanceInLP = await tokenContract.balanceOf(liquidityToken.address);
      let shibaAmount = Number(getFullDisplayBalance(shibaBalanceInLP, tokenContract.decimal));
      const priceOfOneFtmInDollars = await this.getWFTMPriceFromPancakeswap();
      let priceOfShiba = (ftmAmount / shibaAmount) * Number(priceOfOneFtmInDollars);
      return priceOfShiba.toString();
    } catch (err) {
      console.error(`Failed to fetch token price of ${tokenContract.symbol}: ${err}`);
    }
  }

  async getWFTMPriceFromPancakeswap(): Promise<string> {
    const ready = await this.provider.ready;
    if (!ready) return;
    const { WFTM, FUSDT } = this.externalTokens;
    try {
      const fusdt_wftm_lp_pair = this.externalTokens['USDT-FTM-LP'];
      let ftm_amount_BN = await WFTM.balanceOf(fusdt_wftm_lp_pair.address);
      let ftm_amount = Number(getFullDisplayBalance(ftm_amount_BN, WFTM.decimal));
      let fusdt_amount_BN = await FUSDT.balanceOf(fusdt_wftm_lp_pair.address);
      let fusdt_amount = Number(getFullDisplayBalance(fusdt_amount_BN, FUSDT.decimal));
      return (fusdt_amount / ftm_amount).toString();
    } catch (err) {
      console.error(`Failed to fetch token price of WFTM: ${err}`);
    }
  }

  //===================================================================
  //===================================================================
  //===================== MASONRY METHODS =============================
  //===================================================================
  //===================================================================

  async getMasonryAPR() {
    const Masonry = this.currentMasonry();
    
    const latestSnapshotIndex = await Masonry.latestSnapshotIndex();
    
    const lastHistory = await Masonry.boardroomHistory(latestSnapshotIndex);
   
    const lastRewardsReceived = lastHistory[1];

    const TSHAREPrice = (await this.getShareStat()).priceInDollars;
    const TOMBPrice = (await this.getTombStat()).priceInDollars;
    const epochRewardsPerShare = lastRewardsReceived / 1e18;
    
    //Mgod formula
    const amountOfRewardsPerDay = epochRewardsPerShare * Number(TOMBPrice) * 4;
 
    const masonrytShareBalanceOf = await this.TSHARE.balanceOf(Masonry.address);
    const masonryTVL = Number(getDisplayBalance(masonrytShareBalanceOf, this.TSHARE.decimal)) * Number(TSHAREPrice);
    const realAPR = ((amountOfRewardsPerDay * 100) / masonryTVL) * 365;
    return realAPR;
  }

  /**
   * Checks if the user is allowed to retrieve their reward from the Masonry
   * @returns true if user can withdraw reward, false if they can't
   */
  async canUserClaimRewardFromMasonry(): Promise<boolean> {
    const Masonry = this.currentMasonry();
    return await Masonry.canClaimReward(this.myAccount);
  }

  /**
   * Checks if the user is allowed to retrieve their reward from the Masonry
   * @returns true if user can withdraw reward, false if they can't
   */
  async canUserUnstakeFromMasonry(): Promise<boolean> {
    const Masonry = this.currentMasonry();
    const canWithdraw = await Masonry.canWithdraw(this.myAccount);
    const stakedAmount = await this.getStakedSharesOnMasonry();
    const notStaked = Number(getDisplayBalance(stakedAmount, this.TSHARE.decimal)) === 0;
    const result = notStaked ? true : canWithdraw;
    return result;
  }

  async timeUntilClaimRewardFromMasonry(): Promise<BigNumber> {
    // const Masonry = this.currentMasonry();
    // const mason = await Masonry.masons(this.myAccount);
    return BigNumber.from(0);
  }

  async getTotalStakedInMasonry(): Promise<BigNumber> {
    const Masonry = this.currentMasonry();
    return await Masonry.totalSupply();
  }

  async stakeShareToMasonry(amount: string): Promise<TransactionResponse> {
    if (this.isOldMasonryMember()) {
      throw new Error("you're using old masonry. please withdraw and deposit the TSHARE again.");
    }
    const Masonry = this.currentMasonry();
    return await Masonry.stake(decimalToBalance(amount));
  }

  async getStakedSharesOnMasonry(): Promise<BigNumber> {
    const Masonry = this.currentMasonry();
    if (this.masonryVersionOfUser === 'v1') {
      return await Masonry.getShareOf(this.myAccount);
    }
    return await Masonry.balanceOf(this.myAccount);
  }

  async getEarningsOnMasonry(): Promise<BigNumber> {
    const Masonry = this.currentMasonry();
    if (this.masonryVersionOfUser === 'v1') {
      return await Masonry.getCashEarningsOf(this.myAccount);
    }
    return await Masonry.earned(this.myAccount);
  }

  async withdrawShareFromMasonry(amount: string): Promise<TransactionResponse> {
    const Masonry = this.currentMasonry();
    return await Masonry.withdraw(decimalToBalance(amount));
  }

  async harvestCashFromMasonry(): Promise<TransactionResponse> {
    const Masonry = this.currentMasonry();
    if (this.masonryVersionOfUser === 'v1') {
      return await Masonry.claimDividends();
    }
    return await Masonry.claimReward();
  }

  async exitFromMasonry(): Promise<TransactionResponse> {
    const Masonry = this.currentMasonry();
    return await Masonry.exit();
  }

  async getTreasuryNextAllocationTime(): Promise<AllocationTime> {
    const { Treasury } = this.contracts;
    const nextEpochTimestamp: BigNumber = await Treasury.nextEpochPoint();
    const nextAllocation = new Date(nextEpochTimestamp.mul(1000).toNumber());
    const prevAllocation = new Date(Date.now());

    return { from: prevAllocation, to: nextAllocation };
  }
  /**
   * This method calculates and returns in a from to to format
   * the period the user needs to wait before being allowed to claim
   * their reward from the masonry
   * @returns Promise<AllocationTime>
   */
  async getUserClaimRewardTime(): Promise<AllocationTime> {
    const { Masonry, Treasury } = this.contracts;
    const nextEpochTimestamp = await Masonry.nextEpochPoint(); //in unix timestamp
    const currentEpoch = await Masonry.epoch();
    const mason = await Masonry.members(this.myAccount);
    const startTimeEpoch = mason.epochTimerStart;
    const period = await Treasury.PERIOD();
    const periodInHours = period / 60 / 60; // 6 hours, period is displayed in seconds which is 21600
    const rewardLockupEpochs = await Masonry.rewardLockupEpochs();
    const targetEpochForClaimUnlock = Number(startTimeEpoch) + Number(rewardLockupEpochs);

    const fromDate = new Date(Date.now());
    if (targetEpochForClaimUnlock - currentEpoch <= 0) {
      return { from: fromDate, to: fromDate };
    } else if (targetEpochForClaimUnlock - currentEpoch === 1) {
      const toDate = new Date(nextEpochTimestamp * 1000);
      return { from: fromDate, to: toDate };
    } else {
      const toDate = new Date(nextEpochTimestamp * 1000);
      const delta = targetEpochForClaimUnlock - currentEpoch - 1;
      const endDate = moment(toDate)
        .add(delta * periodInHours, 'hours')
        .toDate();
      return { from: fromDate, to: endDate };
    }
  }

  /**
   * This method calculates and returns in a from to to format
   * the period the user needs to wait before being allowed to unstake
   * from the masonry
   * @returns Promise<AllocationTime>
   */
  async getUserUnstakeTime(): Promise<AllocationTime> {
    const { Masonry, Treasury } = this.contracts;
    const nextEpochTimestamp = await Masonry.nextEpochPoint();
    const currentEpoch = await Masonry.epoch();
    const mason = await Masonry.members(this.myAccount);
    const startTimeEpoch = mason.epochTimerStart;
    const period = await Treasury.PERIOD();
    const PeriodInHours = period / 60 / 60;
    const withdrawLockupEpochs = await Masonry.withdrawLockupEpochs();
    const fromDate = new Date(Date.now());
    const targetEpochForClaimUnlock = Number(startTimeEpoch) + Number(withdrawLockupEpochs);
    const stakedAmount = await this.getStakedSharesOnMasonry();
    if (currentEpoch <= targetEpochForClaimUnlock && Number(stakedAmount) === 0) {
      return { from: fromDate, to: fromDate };
    } else if (targetEpochForClaimUnlock - currentEpoch === 1) {
      const toDate = new Date(nextEpochTimestamp * 1000);
      return { from: fromDate, to: toDate };
    } else {
      const toDate = new Date(nextEpochTimestamp * 1000);
      const delta = targetEpochForClaimUnlock - Number(currentEpoch) - 1;
      const endDate = moment(toDate)
        .add(delta * PeriodInHours, 'hours')
        .toDate();
      return { from: fromDate, to: endDate };
    }
  }

  async watchAssetInMetamask(assetName: string): Promise<boolean> {
    const { ethereum } = window as any;
    if (ethereum && ethereum.networkVersion === config.chainId.toString()) {
      let asset;
      let assetUrl;
      if (assetName === 'TOMB') {
        asset = this.TOMB;
        assetUrl = 'https://tomb.finance/presskit/tomb_icon_noBG.png';
      } else if (assetName === 'TSHARE') {
        asset = this.TSHARE;
        assetUrl = 'https://tomb.finance/presskit/tshare_icon_noBG.png';
      } else if (assetName === 'TBOND') {
        asset = this.TBOND;
        assetUrl = 'https://tomb.finance/presskit/tbond_icon_noBG.png';
      }
      await ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: asset.address,
            symbol: asset.symbol,
            decimals: 18,
            image: assetUrl,
          },
        },
      });
    }
    return true;
  }

  async provideTombFtmLP(ftmAmount: string, tombAmount: BigNumber): Promise<TransactionResponse> {
    const { TaxOffice } = this.contracts;
    let overrides = {
      value: parseUnits(ftmAmount, 18),
    };
    return await TaxOffice.addLiquidityETHTaxFree(tombAmount, tombAmount.mul(992).div(1000), parseUnits(ftmAmount, 18).mul(992).div(1000), overrides);
  }

  async quoteFromSpooky(tokenAmount: string, tokenName: string): Promise<string> {
    const { SpookyRouter } = this.contracts;
    const { _reserve0, _reserve1 } = await this.TOMBWFTM_LP.getReserves();
    let quote;
    if (tokenName === 'TOMB') {
      quote = await SpookyRouter.quote(parseUnits(tokenAmount), _reserve1, _reserve0);
    } else {
      quote = await SpookyRouter.quote(parseUnits(tokenAmount), _reserve0, _reserve1);
    }
    return (quote / 1e18).toString();
  }

  /**
   * @returns an array of the regulation events till the most up to date epoch
   */
  async listenForRegulationsEvents(): Promise<any> {
    const { Treasury } = this.contracts;

    const treasuryDaoFundedFilter = Treasury.filters.DaoFundFunded();
    const treasuryDevFundedFilter = Treasury.filters.DevFundFunded();
    const treasuryMasonryFundedFilter = Treasury.filters.BoardroomFunded();
    const boughtBondsFilter = Treasury.filters.BoughtBonds();
    const redeemBondsFilter = Treasury.filters.RedeemedBonds();

    let epochBlocksRanges: any[] = [];
    let masonryFundEvents = await Treasury.queryFilter(treasuryMasonryFundedFilter);
    var events: any[] = [];
    masonryFundEvents.forEach(function callback(value, index) {
      events.push({ epoch: index + 1 });
      events[index].masonryFund = getDisplayBalance(value.args[1]);
      if (index === 0) {
        epochBlocksRanges.push({
          index: index,
          startBlock: value.blockNumber,
          boughBonds: 0,
          redeemedBonds: 0,
        });
      }
      if (index > 0) {
        epochBlocksRanges.push({
          index: index,
          startBlock: value.blockNumber,
          boughBonds: 0,
          redeemedBonds: 0,
        });
        epochBlocksRanges[index - 1].endBlock = value.blockNumber;
      }
    });

    epochBlocksRanges.forEach(async (value, index) => {
      events[index].bondsBought = await this.getBondsWithFilterForPeriod(
        boughtBondsFilter,
        value.startBlock,
        value.endBlock,
      );
      events[index].bondsRedeemed = await this.getBondsWithFilterForPeriod(
        redeemBondsFilter,
        value.startBlock,
        value.endBlock,
      );
    });
    let DEVFundEvents = await Treasury.queryFilter(treasuryDevFundedFilter);
    DEVFundEvents.forEach(function callback(value, index) {
      events[index].devFund = getDisplayBalance(value.args[1]);
    });
    let DAOFundEvents = await Treasury.queryFilter(treasuryDaoFundedFilter);
    DAOFundEvents.forEach(function callback(value, index) {
      events[index].daoFund = getDisplayBalance(value.args[1]);
    });
    return events;
  }

  /**
   * Helper method
   * @param filter applied on the query to the treasury events
   * @param from block number
   * @param to block number
   * @returns the amount of bonds events emitted based on the filter provided during a specific period
   */
  async getBondsWithFilterForPeriod(filter: EventFilter, from: number, to: number): Promise<number> {
    const { Treasury } = this.contracts;
    const bondsAmount = await Treasury.queryFilter(filter, from, to);
    return bondsAmount.length;
  }

  async estimateZapIn(tokenName: string, lpName: string, amount: string): Promise<number[]> {
    const { zapper } = this.contracts;
    const lpToken = this.externalTokens[lpName];
    let estimate;
    if (tokenName === FTM_TICKER) {
      estimate = await zapper.estimateZapIn(lpToken.address, SPOOKY_ROUTER_ADDR, parseUnits(amount, 18));
    } else {
      const token = tokenName === TOMB_TICKER ? this.TOMB : this.TSHARE;
      estimate = await zapper.estimateZapInToken(
        token.address,
        lpToken.address,
        SPOOKY_ROUTER_ADDR,
        parseUnits(amount, 18),
      );
    }
    return [estimate[0] / 1e18, estimate[1] / 1e18];
  }
  async zapIn(tokenName: string, lpName: string, amount: string): Promise<TransactionResponse> {
    const { zapper } = this.contracts;
    const lpToken = this.externalTokens[lpName];
    if (tokenName === FTM_TICKER) {
      let overrides = {
        value: parseUnits(amount, 18),
      };
      return await zapper.zapIn(lpToken.address, SPOOKY_ROUTER_ADDR, this.myAccount, overrides);
    } else {
      const token = tokenName === TOMB_TICKER ? this.TOMB : this.TSHARE;
      return await zapper.zapInToken(
        token.address,
        parseUnits(amount, 18),
        lpToken.address,
        SPOOKY_ROUTER_ADDR,
        this.myAccount,
      );
    }
  }
  async swapTBondToTShare(tbondAmount: BigNumber): Promise<TransactionResponse> {
    const { TShareSwapper } = this.contracts;
    return await TShareSwapper.swapTBondToTShare(tbondAmount);
  }
  async estimateAmountOfTShare(tbondAmount: string): Promise<string> {
    const { TShareSwapper } = this.contracts;
    try {
      const estimateBN = await TShareSwapper.estimateAmountOfTShare(parseUnits(tbondAmount, 18));
      return getDisplayBalance(estimateBN, 18, 6);
    } catch (err) {
      console.error(`Failed to fetch estimate tshare amount: ${err}`);
    }
  }

  async getTShareSwapperStat(address: string): Promise<TShareSwapperStat> {
    const { TShareSwapper } = this.contracts;
    const tshareBalanceBN = await TShareSwapper.getTShareBalance();
    const tbondBalanceBN = await TShareSwapper.getTBondBalance(address);
    // const tombPriceBN = await TShareSwapper.getTombPrice();
    // const tsharePriceBN = await TShareSwapper.getTSharePrice();
    const rateTSharePerTombBN = await TShareSwapper.getTShareAmountPerTomb();
    const tshareBalance = getDisplayBalance(tshareBalanceBN, 18, 5);
    const tbondBalance = getDisplayBalance(tbondBalanceBN, 18, 5);
    return {
      tshareBalance: tshareBalance.toString(),
      tbondBalance: tbondBalance.toString(),
      // tombPrice: tombPriceBN.toString(),
      // tsharePrice: tsharePriceBN.toString(),
      rateTSharePerTomb: rateTSharePerTombBN.toString(),
    };
  }


    /**
   * Get NFTs in a wallet
   * @param address account address
   * @returns
   */
     async getNFTsInWallet(address: string, nftContract: string): Promise<any[]> {
      const tokenIds:number[] = await this.contracts[nftContract].walletOfOwner(address);
  
      return await Promise.all(tokenIds.map(async tokenId => {
          return {
            tokenId,
            metaDataJson: await this.contracts[nftContract].tokenURI(tokenId),
          };
        })
      );
    }
  
    /**
     * Get NFTs which are staked
     * @param address account address
     * @returns
     */
     async getNFTsStaked(address: string, nftContract: string, stakingContract: string): Promise<any[]> {
      const tokenIds: number[] = await this.contracts[stakingContract].depositsOf(address);
      console.log(tokenIds);
      return await Promise.all(tokenIds.map(async tokenId => {
          return {
            tokenId,
            metaDataJson: await this.contracts[nftContract].tokenURI(tokenId),
          };
        })
      );
    }
  
    /**
     * Get NFTs which are land staked
     * @param address account address
     * @returns
     */
     async getNFTsLandStaked(address: string): Promise<any[]> {
      const tokenIds: number[] = await this.contracts['LandStakingv1'].depositsOf(address);
  
      return await Promise.all(tokenIds.map(async tokenId => {
          return {
            tokenId,
            metaDataJson: await this.contracts['LandWalletNFT'].tokenURI(tokenId),
          };
        })
      );
    }
  
    /**
     * Get total amount of NFTs in a wallet
     * @returns
     */
     async nftTotalSupply(contract: string = 'WalletNFT'): Promise<number> {
      const totalSupply:BigNumber = await this.contracts[contract].totalSupply();
      return totalSupply.toNumber();
    }
  
    /**
     * Get total amount of NFTs which are staked
     * @returns
     */
     async nftStakedTotalSupply(walletContract: string = 'WalletNFT', stakingContract: string = 'StakingNFT'): Promise<number> {
      const totalSupply:BigNumber = await this.contracts[walletContract].balanceOf(this.config.deployments[stakingContract].address);
      return totalSupply.toNumber();
    }
  
    /**
     * Calculate reward for a token and an address
     * @param address account address
     * @param tokenId Id of token selected
     * @returns
     */
     async calculateRewards(address: string, tokenIds: BigNumber, contract: string = 'StakingNFT'): Promise<string> {
      const reward:BigNumber[] = await this.contracts[contract].calculateRewards(address, tokenIds);
      return reward[0].toString();
    }
  
    /**
     * Unstake nft item
     * @param address account address
     * @param tokenId Id of token selected
     * @returns
     */
    async unStake(tokenId: BigNumber, contract: string = 'StakingNFT'): Promise<void> {
      await this.contracts[contract].withdraw([tokenId]);
    }
  
    /**
     * Cliam rewards for nft items
     * @param address account address
     * @param tokenId Id of token selected
     * @returns
     */
    async claim(tokenId: BigNumber, contract: string = 'StakingNFT'): Promise<void> {
      await this.contracts[contract].claimRewards([BigNumber.from(tokenId)]);
    }
  
    /**
     * Unstake nft item
     * @param address account address
     * @param tokenIds Ids of token selected
     */
     async stakeNfts(tokenIds: BigNumber[], contract: string = 'StakingNFT'): Promise<void> {
      await this.contracts[contract].deposit(tokenIds);
    }
  
    /**
     * Approve account for ERC20 and ERC721
     * @param address account address
     */
     async approve(nftContract: string, stakingContract: string): Promise<void> {
      const stakingAddress: string = this.config.deployments[stakingContract].address;
  
      await this.contracts['ERC20'].approve(stakingAddress, BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'));
      await this.contracts[nftContract].setApprovalForAll(stakingAddress, true);
    }
  
    /**
     * Approve landing staking contract on ERC721
     */
    async landStakingApprove(): Promise<void> {
      const stakingAddress: string = this.config.deployments['LandStakingv1'].address;
  
      await this.contracts['LandWalletNFT'].setApprovalForAll(stakingAddress, true);
    }
  
    /**
    * Approve landing staking contract on ERC721
    */
    async landStakingClaim1(): Promise<void> {
      await this.contracts['LandStakingv1'].claimEmissions1();
    }
  
    /**
    * Approve landing staking contract on ERC721
    */
    async landStakingClaim2(): Promise<void> {
      await this.contracts['LandStakingv1'].claimEmissions2();
    }
  
    /**
     * Get Land NFTs in a wallet
     * @param address account address
     * @returns
    */
    async getLandNFTsInWallet(address: string): Promise<any[]> {
      const tokenIds:number[] = await this.contracts['LandWalletNFT'].walletOfOwner(address);
  
      return await Promise.all(tokenIds.map(async tokenId => {
          return {
            tokenId,
            metaDataJson: await this.contracts['LandWalletNFT'].tokenURI(tokenId),
          };
        })
      );
    }
}
