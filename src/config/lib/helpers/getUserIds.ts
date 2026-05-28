import db from 'config/db/databaseServise';

export async function getUserIds(): Promise<number[]> {
  const usersFromDatabase = await db.getUsersForParse();
  return usersFromDatabase.map((user) => user.id);
}
