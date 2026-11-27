export * from 'sources/kufar/types';

export interface IProfile {
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface IDataParserItem {
  urlId: number;
  url: string;
  isActive: boolean;
  intervalMinutes: number;
  lastCheckedAt?: Date;
}

export interface IExtendedDataParserItem {
  _id: string;
}

export interface IParserData {
  urls: IDataParserItem[];
  canNotify: boolean;
}

export interface ICommandHandler {
  regex: RegExp;
  handler: (userId: number, match: RegExpExecArray | null) => Promise<void>;
  options?: { public?: boolean };
}

export type LanguageOfUser = Record<number, { language: Languages }>;

export enum Languages {
  Russian = 'ru',
  Belarusian = 'by',
}

export interface IButton {
  text: string;
  callback_data: string;
}

export enum Button {
  ADD = 'add',
  ADD_MORE = 'add_more',
  WRAP = 'wrap',
  UPDATE = 'update',
  START_OBSERVE = 'start_observe',
  STOP_OBSERVE = 'stop_observe',
  DELETE = 'delete',
  BACK = 'back',
}

export interface IFaq {
  question: string;
  answer: string;
}

export interface ICallbackData {
  action: string;
  param?: any;
}

export function isTelegramError(error: unknown): error is {
  response: {
    body: {
      error_code: number;
      description: string;
      parameters?: { retry_after?: number };
    };
  };
} {
  const body = (error as any)?.response?.body;
  return (
    typeof body?.error_code === 'number' &&
    typeof body?.description === 'string'
  );
}
