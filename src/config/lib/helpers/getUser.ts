import db from 'config/db/databaseServise';
import { type IParserData } from 'config/types';

export async function getUser(userId: number): Promise<IParserData> {
  return await db.getUserForParse(userId);
}
