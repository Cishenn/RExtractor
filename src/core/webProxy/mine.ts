import { pick } from 'lodash';
import { httpProxy } from './base';
import { IUser } from '@/isomorphic/interface';

export interface ISavePosition {
  id: number;
  type: 'Book' | 'Note';
  name: string;
}

export const DefaultSavePosition: ISavePosition = {
  id: 0,
  type: 'Note',
  name: '保存云文档',
};

export function createMineProxy() {
  return {
    getBooks: async (): Promise<ISavePosition[]> => {
      return new Promise((resolve, reject) => {
        httpProxy.sendMethodCallToBackground(
          {
            url: '/api/mine/personal_books',
            config: {
              method: 'GET',
              data: {
                limit: 200,
                offset: 0,
              },
            },
          },
          res => {
            if (res.status !== 200) {
              reject(res);
              return;
            }
            const result = res?.data?.data
              ?.map((item: any) => {
                if (item.type !== 'Book') {
                  return null;
                }
                return pick(item, ['name', 'id', 'type']);
              })
              ?.filter((item: any) => !!item);
            return resolve(result || []);
          },
        );
      });
    },
    updateUserSettings: async (key: string, value: any): Promise<{ success: boolean }> => {
      return new Promise(resolve => {
        httpProxy.sendMethodCallToBackground(
          {
            url: '/api/mine/user_settings',
            config: {
              method: 'PUT',
              data: {
                key,
                value,
              },
            },
          },
          res => {
            return resolve(res);
          },
        );
      });
    },
    getUserInfo: async (): Promise<IUser> => {
      return new Promise(resolve => {
        httpProxy.sendMethodCallToBackground(
          {
            url: '/api/mine',
            config: {
              method: 'GET',
            },
          },
          res => {
            resolve(res?.data?.data);
          },
        );
      });
    },
  };
}
