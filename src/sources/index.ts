import { type MarketSource } from 'sources/types';
import { KufarSource } from 'sources/kufar/KufarSource';

export * from 'sources/types';
export * from 'sources/kufar/types';
export * from 'sources/kufar/KufarMapper';
export * from 'sources/kufar/KufarSource';

export const sources: Record<string, MarketSource> = {
  kufar: new KufarSource(),
};

export function getSource(name: string): MarketSource {
  const source = sources[name];
  if (!source) {
    throw new Error(`Unknown market source: ${name}`);
  }
  return source;
}
