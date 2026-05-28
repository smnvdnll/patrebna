/* eslint-disable @typescript-eslint/explicit-function-return-type */
import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from 'config/db/models/User';
import { Profile } from 'config/db/models/Profile';
import { Parser } from 'config/db/models/Parser';
import { KufarAd } from 'config/db/models/KufarAd';
import { DataParser } from 'config/db/models/DataParser';
import {
  type IAd,
  type IProfile,
  type IDataParserItem,
  type IExtendedDataParserItem,
  type IParserData,
} from 'config/types';
import { checkUrlOfKufar } from 'config/lib/helpers/checkUrlOfKufar';
import { TelegramService } from 'config/telegram/telegramServise';

class DatabaseService {
  private readonly url: string;

  constructor() {
    this.url = process.env.MONGODB_URL ?? 'mongodb://mongodb:27017/';
  }

  async openConnection() {
    const username = process.env.MONGO_INITDB_ROOT_USERNAME ?? '';
    const password = process.env.MONGO_INITDB_ROOT_PASSWORD ?? '';

    const connect = mongoose.connection;
    connect.on(
      'error',
      console.error.bind(console, 'Ошибка подключения к базе данных:'),
    );
    connect.once('open', () => {
      console.log('Успешное подключение к базе данных.');
    });

    await mongoose.connect(this.url, {
      auth: {
        username,
        password,
      },
      dbName: 'patrebna',
      authSource: 'admin',
      serverSelectionTimeoutMS: 60000,
      socketTimeoutMS: 120000,
    });
  }

  async getUser(id: number) {
    return await User.findOne({ id });
  }

  async getProfile(id: number) {
    const user = await this.getUser(id);
    return await Profile.findOne(user?.profile?._id);
  }

  async getParser(id: number) {
    const user = await this.getUser(id);
    return await Parser.findOne(user?.parser?._id).populate('kufar');
  }

  async getDataParser(id: number) {
    const parser = await this.getParser(id);
    const dataParserId = parser?.kufar?.dataParser?._id;
    if (!dataParserId) return;
    return await DataParser.findOne(dataParserId);
  }

  async getUsersForParse(): Promise<Array<{ id: number }>> {
    return await User.find().select('-_id id').lean();
  }

  async getUserForParse(userId: number): Promise<IParserData> {
    const dataParser = await this.getDataParser(userId);
    const extendedUrls: IExtendedDataParserItem[] =
      dataParser?.urls.toObject() ?? [];
    const urls = extendedUrls.map(({ _id, ...rest }) => {
      const url = rest as IDataParserItem;
      return {
        ...url,
        intervalMinutes: url.intervalMinutes ?? 1,
      };
    });
    return {
      urls,
      canNotify: true,
    };
  }

  async setUser(id: number, data: IProfile) {
    const profile = await Profile.create(data);
    const parser = await Parser.create({});
    const newUser = await User.create({
      id,
      profile: profile._id,
      parser: parser._id,
    });

    await TelegramService.sendMessageToChat(
      `${[
        `🙍 Пользователь с id: <b>${id}</b> присоединился к боту`,
        `👥 Всего пользователей: <b>${await User.countDocuments({})}</b>`,
      ].join('\n')}`,
    );
    return newUser;
  }

  async removeUser(id: number) {
    const user = await this.getUser(id);
    if (!user) return;

    const parser = await this.getParser(id);
    const profile = await this.getProfile(id);
    const dataParser = await this.getDataParser(id);
    const kufarObjectIds = parser?.kufar?.kufarAds.flatMap((item) => item.ads);

    await KufarAd.deleteMany({ _id: { $in: kufarObjectIds } });
    await User.deleteOne({ id });
    if (profile) await Profile.deleteOne(profile._id);
    if (parser) await Parser.deleteOne(parser._id);
    if (dataParser) await DataParser.deleteOne(dataParser._id);
  }

  async setUrlKufar(
    userId: number,
    url: string,
    urlId: number,
    intervalMinutes: number,
  ) {
    const regex =
      /^(https?:\/\/(?:www\.)?(?:re\.|auto\.)?kufar\.by\/l)[\wа-яА-Я\-_.~!*'();/?:@&=+$,%]*$/;

    if (!url.match(regex)) return new Error();
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) {
      return new Error();
    }

    const dataUrl = await checkUrlOfKufar(url);
    if (!dataUrl) return new Error();

    const parser = await this.getParser(userId);
    const dataParser = await this.getDataParser(userId);
    const dataParserItem: IDataParserItem = {
      urlId,
      url,
      isActive: true,
      intervalMinutes,
      lastCheckedAt: new Date(),
    };

    if (!dataParser) {
      const newDataParser = await DataParser.create({ urls: [dataParserItem] });
      await parser?.updateOne({ 'kufar.dataParser': newDataParser._id });
    } else {
      const updatedUrls = dataParser.urls.map((u) =>
        u.urlId === urlId ? dataParserItem : u,
      );

      if (!dataParser.urls.some((u) => u.urlId === urlId)) {
        updatedUrls.push(dataParserItem);
      }

      await DataParser.updateOne(
        { _id: dataParser._id },
        { $set: { urls: updatedUrls } },
      );

      if (dataParser.urls.some((u) => u.urlId === urlId)) {
        await this.removeKufarAdsByUrlId(userId, urlId);
      }
    }

    await this.addUniqueAds(userId, dataUrl, urlId);
    return dataUrl.length;
  }

  async touchUrlKufar(userId: number, urlId: number) {
    const dataParser = await this.getDataParser(userId);
    if (!dataParser) return;
    const urls = dataParser.urls.map((url) =>
      url.urlId === urlId ? { ...url.toObject(), lastCheckedAt: new Date() } : url,
    );
    await DataParser.updateOne({ _id: dataParser._id }, { $set: { urls } });
  }

  async toggleUrlStatus(userId: number, urlId: number) {
    const dataParser = await this.getDataParser(userId);
    const urls = dataParser?.urls.map((url) => {
      if (url.urlId === urlId) {
        return {
          ...url.toObject(),
          isActive: !url.isActive,
        };
      }
      return url;
    });

    const updatedParser = await DataParser.findOneAndUpdate(
      { _id: dataParser?._id },
      { $set: { urls } },
      { new: true },
    );
    const updatedUrl = updatedParser?.urls.find((url) => url.urlId === urlId);
    return updatedUrl?.isActive;
  }

  async getUrlInformation(userId: number, urlId: number) {
    const dataParser = await this.getDataParser(userId);
    const parser = await db.getParser(userId);
    const currentUrl = dataParser?.urls.find((url) => url.urlId === urlId);
    const currentAds = parser?.kufar?.kufarAds.find(
      (url) => url.urlId === urlId,
    );
    return {
      url: decodeURIComponent(currentUrl?.url ?? ''),
      statusUrl: currentUrl?.isActive,
      numberOfAds: currentAds?.ads.length,
      intervalMinutes: currentUrl?.intervalMinutes,
      lastCheckedAt: currentUrl?.lastCheckedAt,
    };
  }

  async removeUrlKufar(userId: number, urlId: number) {
    const dataParser = await this.getDataParser(userId);
    if (!dataParser) return;

    const urls = dataParser.urls
      .filter((url) => url.urlId !== urlId)
      .map((url, index) => ({
        urlId: index + 1,
        url: url.url,
        isActive: url.isActive,
        intervalMinutes: url.intervalMinutes,
        lastCheckedAt: url.lastCheckedAt,
        _id: url._id,
      }));

    if (!urls.length) {
      await DataParser.deleteOne({ _id: dataParser._id });
      await Parser.updateMany(
        { 'kufar.dataParser': dataParser._id },
        { $unset: { 'kufar.dataParser': '' } },
      );
    } else {
      await DataParser.updateOne({ _id: dataParser._id }, { $set: { urls } });
    }

    await this.removeKufarAdsByUrlId(userId, urlId);

    const updatedParser = await this.getParser(userId);

    await Parser.updateOne(
      { _id: updatedParser?._id },
      {
        $set: {
          'kufar.kufarAds': updatedParser?.kufar?.kufarAds.map((ad, index) => ({
            ...ad.toObject(),
            urlId: index + 1,
          })),
        },
      },
    );
  }

  async addUniqueAds(id: number, parseAds: IAd[], urlId: number) {
    const parser = await this.getParser(id);
    const existingAds = await KufarAd.find(
      { _id: { $in: parser?.kufar?.kufarAds.flatMap((item) => item.ads) } },
      { id: 1, _id: 0 },
    );
    const existingIds = existingAds.map((ad) => ad.id);
    const newAds = parseAds.filter((ad) => !existingIds.includes(ad.id));
    if (!newAds.length) return [];
    const createdAds = await KufarAd.insertMany(newAds);
    const ads = createdAds.map((ad) => ad._id);
    const existingKufarAds = parser?.kufar?.kufarAds.find(
      (item) => item.urlId === urlId,
    );
    existingKufarAds
      ? existingKufarAds.ads.push(...ads)
      : parser?.kufar?.kufarAds.push({ urlId, ads });
    await parser?.save();
    return newAds;
  }

  async removeKufarAdsByUrlId(userId: number, urlId: number) {
    const parser = await this.getParser(userId);
    const removedAds = parser?.kufar?.kufarAds.filter(
      (ad) => ad.urlId === urlId,
    );
    const updatedKufarAds = parser?.kufar?.kufarAds.filter(
      (ad) => ad.urlId !== urlId,
    );
    await Parser.updateOne(
      { _id: parser?._id },
      { $set: { 'kufar.kufarAds': updatedKufarAds } },
    );

    if (removedAds) {
      const kufarObjectIds = removedAds[0]?.ads;
      await KufarAd.deleteMany({
        _id: { $in: kufarObjectIds },
      });
    }
  }

  async clearExpiredAdReferences() {
    const activeAdIds = await KufarAd.find({}, '_id').then((ads) =>
      ads.map((ad) => ad._id),
    );

    await Parser.updateMany(
      {},
      { $pull: { 'kufar.kufarAds.$[].ads': { $nin: activeAdIds } } },
    );
  }
}

const db = new DatabaseService();
export default db;
