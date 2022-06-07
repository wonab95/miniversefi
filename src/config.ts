// import { ChainId } from '@pancakeswap-libs/sdk';
import { ChainId } from '@spookyswap/sdk';
import { Configuration } from './tomb-finance/config';
import { BankInfo } from './tomb-finance';

const configurations: { [env: string]: Configuration } = {

  production: {
    chainId: ChainId.MAINNET,
    networkName: 'Fantom Opera Mainnet',
    ftmscanUrl: 'https://ftmscan.com',
    defaultProvider: 'https://rpc.ftm.tools/',
    deployments: require('./tomb-finance/deployments/deployments.mainnet.json'),
    externalTokens: {
      WFTM: ['0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83', 18],
      FUSDT: ['0x04068DA6C83AFCFA0e13ba15A6696662335D5B75', 6], // This is actually usdc on mainnet not fusdt
      WETH: ['0x74b23882a30290451A17c44f4F05243b6b58C76d', 18], // BOO: 0x841FAD6EAe12c286d1Fd18d1d525DFfA75C7EFFE 18
      TOMB: ['0x6c021ae822bea943b2e66552bde1d2696a53fbb7', 18], // ZOO: 0x09e145a1d53c0045f41aeef25d8ff982ae74dd56 0
      USDC: ['0x04068DA6C83AFCFA0e13ba15A6696662335D5B75', 6], // SHIBA: 0x9ba3e4f84a34df4e08c112e1a0ff148b81655615 9
      FANG: ['0x49894fCC07233957c35462cfC3418Ef0CC26129f', 18],
      MvDOLLAR: ['0x57976c467608983513c9355238dc6de1B1aBbcCA', 18],
      MSHARE: ['0xb011EC534d9175cD7a69aFBfc1bcc9990862c462', 18],
      'USDT-FTM-LP': ['0x2b4C76d0dc16BE1C31D4C1DC53bF9B45987Fc75c', 18],
      'MVDOLLAR-USDC-LP': ['0x35bED1E2f3033395a05CD0b1b5900209ECe42774', 18],
      'MSHARE-USDC-LP': ['0x92A7b2A9ca7D70573E3a0B0BF9e5232c70db8a89', 18],
      'MVDOLLAR-MSHARE-LP': ['0x85E8DcBc11eF5C5F98277B20A041C8ab90E0e2f7', 18]
    },
    baseLaunchDate: new Date('2021-06-02 13:00:00Z'),
    bondLaunchesAt: new Date('2020-12-03T15:00:00Z'),
    masonryLaunchesAt: new Date('2020-12-11T00:00:00Z'),
    refreshInterval: 10000,
  },
};



export const bankDefinitions: { [contractName: string]: BankInfo } = {
  /*
  Explanation:
  name: description of the card
  poolId: the poolId assigned in the contract
  sectionInUI: way to distinguish in which of the 3 pool groups it should be listed
        - 0 = Single asset stake pools
        - 1 = LP asset staking rewarding TOMB
        - 2 = LP asset staking rewarding TSHARE
  contract: the contract name which will be loaded from the deployment.environmnet.json
  depositTokenName : the name of the token to be deposited
  earnTokenName: the rewarded token
  finished: will disable the pool on the UI if set to true
  sort: the order of the pool
  */
  TombFtmRewardPool: {
    name: 'Stake WFTM, earn MvDOLLAR',
    poolId: 1,
    sectionInUI: 0,
    contract: 'TombFtmRewardPool',
    depositTokenName: 'WFTM',
    earnTokenName: 'MvDOLLAR',
    multiplier: "100x",
    finished: true,
    sort: 1,
    closedForStaking: true,
  },
  USDCRewardPool: {
    name: 'Stake USDC, earn MvDOLLAR',
    poolId: 0,
    sectionInUI: 0,
    contract: 'USDCRewardPool',
    depositTokenName: 'USDC',
    earnTokenName: 'MvDOLLAR',
    multiplier: "50x",
    finished: true,
    sort: 2,
    closedForStaking: true,
  },
  FANGRewardPool: {
    name: 'Stake FANG, earn MvDOLLAR',
    poolId: 2,
    sectionInUI: 0,
    contract: 'FANGRewardPool',
    depositTokenName: 'FANG',
    earnTokenName: 'MvDOLLAR',
    multiplier: "25x",
    finished: true,
    sort: 3,
    closedForStaking: true,
  },
  LPRewardPool: {
    name: 'Stake MvDOLLAR-USDC LP, earn MvDOLLAR',
    poolId: 3,
    sectionInUI: 0,
    contract: 'LPRewardPool',
    depositTokenName: 'MVDOLLAR-USDC-LP',
    earnTokenName: 'MvDOLLAR',
    multiplier: "100x",
    finished: true,
    sort: 4,
    closedForStaking: true,
  },

  /*shares*/
  LPRewardPool1ShareRewardPool: {
    name: 'Stake MvDOLLAR-USDC LP, earn MSHARE',
    poolId: 2,
    sectionInUI: 2,
    contract: 'LPRewardPool1ShareRewardPool',
    depositTokenName: 'MVDOLLAR-USDC-LP',
    earnTokenName: 'MSHARE',
    multiplier: "100x",
    finished: false,
    sort: 1,
    closedForStaking: false,
  },
  LPRewardPool2ShareRewardPool: {
    name: 'Stake MSHARE-USDC LP, earn MSHARE',
    poolId: 0,
    sectionInUI: 2,
    contract: 'LPRewardPool2ShareRewardPool',
    depositTokenName: 'MSHARE-USDC-LP',
    earnTokenName: 'MSHARE',
    multiplier: "100x",
    finished: false,
    sort: 2,
    closedForStaking: false,
  },
  LPRewardPool3ShareRewardPool: {
    name: 'Stake MvDOLLAR-MSHARE LP, earn MSHARE',
    poolId: 1,
    sectionInUI: 2,
    contract: 'LPRewardPool3ShareRewardPool',
    depositTokenName: 'MVDOLLAR-MSHARE-LP',
    earnTokenName: 'MSHARE',
    multiplier: "100x",
    finished: false,
    sort: 3,
    closedForStaking: false,
  },
  mvdollarShareRewardPool: {
    name: 'Stake MvDOLLAR, earn MSHARE',
    poolId: 3,
    sectionInUI: 2,
    contract: 'mvdollarShareRewardPool',
    depositTokenName: 'MvDOLLAR',
    earnTokenName: 'MSHARE',
    multiplier: "100x",
    finished: false,
    sort: 4,
    closedForStaking: false,
  },
  MSHARENode: {
    name: 'Generate MSHARE with Nodes',
    poolId: 0,
    sectionInUI: 3,
    contract: 'MSHARENode',
    depositTokenName: 'MSHARE',
    earnTokenName: 'MSHARE',
    multiplier: "100x",
    finished: false,
    sort: 4,
    closedForStaking: false,
  },

};

export default configurations['production'];
