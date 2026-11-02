// Web-only stand-ins for Android-only native modules so the UI can be
// previewed with `npm run web`. Native builds never resolve this file.
const noop = () => undefined;
const asyncNoop = async () => undefined;
const Null = () => null;

module.exports = {
  // react-native-google-mobile-ads
  default: Object.assign(() => ({ initialize: async () => [], setRequestConfiguration: asyncNoop }), {}),
  AdEventType: { LOADED: 'loaded', ERROR: 'error', OPENED: 'opened', CLOSED: 'closed' },
  AdsConsent: { gatherConsent: asyncNoop, getConsentInfo: async () => ({ canRequestAds: false }), showPrivacyOptionsForm: asyncNoop, requestInfoUpdate: asyncNoop },
  InterstitialAd: { createForAdRequest: () => ({ load: noop, show: asyncNoop, addAdEventListener: () => noop }) },
  BannerAd: Null,
  BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' },
  TestIds: { BANNER: 'test-banner', INTERSTITIAL: 'test-interstitial' },
  // expo-iap
  ErrorCode: { AlreadyOwned: 'already-owned' },
  getAvailablePurchases: async () => [],
  isUserCancelledError: () => false,
  useIAP: () => ({ connected: false, products: [], fetchProducts: asyncNoop, finishTransaction: asyncNoop, requestPurchase: asyncNoop }),
  // @maplibre/maplibre-react-native
  Map: Null,
  Camera: Null,
  GeoJSONSource: Null,
  Layer: Null,
  // @infinitered/react-native-mlkit-text-recognition
  recognizeText: async () => ({ text: '', blocks: [] }),
  // sp-react-native-in-app-updates
  IAUUpdateKind: {},
  IAUInstallStatus: {},
};
