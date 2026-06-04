import { Field, Root, Type } from 'protobufjs/light';

type ProtoLong = number | { toNumber(): number } | string | null | undefined;

export interface MexcSpotMiniTickerItem {
  symbol?: string;
  price?: string;
  rate?: string;
  zonedRate?: string;
  high?: string;
  low?: string;
  volume?: string;
  quantity?: string;
  lastCloseRate?: string;
  lastCloseZonedRate?: string;
  lastCloseHigh?: string;
  lastCloseLow?: string;
}

export interface MexcSpotDecodedMessage {
  channel?: string;
  symbol?: string;
  symbolId?: string;
  createTime?: number;
  sendTime?: number;
  publicSpotKline?: {
    interval?: string;
    windowStart?: number;
    openingPrice?: string;
    closingPrice?: string;
    highestPrice?: string;
    lowestPrice?: string;
    volume?: string;
    amount?: string;
    windowEnd?: number;
  };
  publicMiniTickers?: {
    items?: MexcSpotMiniTickerItem[];
  };
}

const PublicMiniTickerV3Api = new Type('PublicMiniTickerV3Api')
  .add(new Field('symbol', 1, 'string'))
  .add(new Field('price', 2, 'string'))
  .add(new Field('rate', 3, 'string'))
  .add(new Field('zonedRate', 4, 'string'))
  .add(new Field('high', 5, 'string'))
  .add(new Field('low', 6, 'string'))
  .add(new Field('volume', 7, 'string'))
  .add(new Field('quantity', 8, 'string'))
  .add(new Field('lastCloseRate', 9, 'string'))
  .add(new Field('lastCloseZonedRate', 10, 'string'))
  .add(new Field('lastCloseHigh', 11, 'string'))
  .add(new Field('lastCloseLow', 12, 'string'));

const PublicMiniTickersV3Api = new Type('PublicMiniTickersV3Api')
  .add(new Field('items', 1, 'PublicMiniTickerV3Api', 'repeated'));

const PublicSpotKlineV3Api = new Type('PublicSpotKlineV3Api')
  .add(new Field('interval', 1, 'string'))
  .add(new Field('windowStart', 2, 'int64'))
  .add(new Field('openingPrice', 3, 'string'))
  .add(new Field('closingPrice', 4, 'string'))
  .add(new Field('highestPrice', 5, 'string'))
  .add(new Field('lowestPrice', 6, 'string'))
  .add(new Field('volume', 7, 'string'))
  .add(new Field('amount', 8, 'string'))
  .add(new Field('windowEnd', 9, 'int64'));

const PushDataV3ApiWrapper = new Type('PushDataV3ApiWrapper')
  .add(new Field('channel', 1, 'string'))
  .add(new Field('symbol', 3, 'string', 'optional'))
  .add(new Field('symbolId', 4, 'string', 'optional'))
  .add(new Field('createTime', 5, 'int64', 'optional'))
  .add(new Field('sendTime', 6, 'int64', 'optional'))
  .add(new Field('publicSpotKline', 308, 'PublicSpotKlineV3Api'))
  .add(new Field('publicMiniTickers', 310, 'PublicMiniTickersV3Api'));

new Root()
  .define('mexc')
  .add(PublicMiniTickerV3Api)
  .add(PublicMiniTickersV3Api)
  .add(PublicSpotKlineV3Api)
  .add(PushDataV3ApiWrapper);

function toNumber(value: ProtoLong): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === 'object' && typeof value.toNumber === 'function') {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function decodeMexcSpotMessage(data: Uint8Array): MexcSpotDecodedMessage | null {
  try {
    const decoded = PushDataV3ApiWrapper.decode(data);
    const plain = PushDataV3ApiWrapper.toObject(decoded, {
      longs: Number,
      defaults: false,
      arrays: true,
      objects: true,
    }) as MexcSpotDecodedMessage;

    if (plain.createTime !== undefined) plain.createTime = toNumber(plain.createTime);
    if (plain.sendTime !== undefined) plain.sendTime = toNumber(plain.sendTime);
    if (plain.publicSpotKline?.windowStart !== undefined) {
      plain.publicSpotKline.windowStart = toNumber(plain.publicSpotKline.windowStart);
    }
    if (plain.publicSpotKline?.windowEnd !== undefined) {
      plain.publicSpotKline.windowEnd = toNumber(plain.publicSpotKline.windowEnd);
    }

    return plain;
  } catch {
    return null;
  }
}
