(function (root) {
  'use strict';
  async function createPlatform(env, target, config) {
    const key = config && config.storageKey || 'bagen.probe.v1';
    const mini = env.xhs && env.xhs.miniTool;
    let options = env.xhs && env.xhs.launchOptions;
    if (target === 'minitool' && !(options && options.miniToolEnv && options.miniToolEnv.buildVersion) && mini && typeof mini.getLaunchOptions === 'function') {
      try { options = await mini.getLaunchOptions(); } catch (_) { options = null; }
    }
    const version = Math.floor(Number(options && options.miniToolEnv && options.miniToolEnv.buildVersion || 0) / 1000);
    const supported = (name, minimum) => target === 'minitool' && version >= minimum && mini && typeof mini[name] === 'function';
    // Never switch stores after a platform read/write failure; that would hide existing data.
    const nativeStore = supported('getStorage', 9460) && supported('setStorage', 9460);
    if (target === 'minitool' && version >= 9460 && !nativeStore) throw Error('此客户端未提供完整 Storage API，禁止切换存储覆盖旧档');
    if (target === 'minitool' && !mini) throw Error('未检测到小红书容器，存储与触感探针不可运行');
    return {
      name: target === 'browser' ? '手机浏览器' : '小红书容器', version: version,
      storageName: nativeStore ? '平台 Storage' : (target === 'browser' ? '浏览器本地存储' : '低版本浏览器存储（不保证持久）'),
      storage: {
        read: async function () {
          if (!nativeStore) return env.localStorage.getItem(key);
          const r = await mini.getStorage({ key: key });
          if (!r || (r.data !== null && typeof r.data !== 'string')) throw Error('平台读取未返回有效数据');
          if (r.data !== '') return r.data;
          // Some clients may return an empty string for a missing key. Do not
          // confuse that with an existing empty/corrupt record and overwrite it.
          if (!supported('getStorageInfo', 9460)) throw Error('平台返回空内容，无法确认是否首次使用；原记录保留，请重新读取');
          const info = await mini.getStorageInfo();
          if (!info || (!Array.isArray(info.keys) || !info.keys.every(k => typeof k === 'string'))) throw Error('平台存储清单无法读取，原记录保留');
          if (info.keys.includes(key)) throw Error('测试记录存在但内容为空，已保护原记录；请将此提示反馈给开发者');
          const again = await mini.getStorage({ key: key });
          if (!again || (again.data !== null && typeof again.data !== 'string')) throw Error('平台复读未返回有效数据');
          return again.data === '' ? null : again.data;
        },
        write: async function (data) {
          if (nativeStore) await mini.setStorage({ key: key, data: data });
          else env.localStorage.setItem(key, data);
        }
      },
      windowInfo: async function () { return supported('getWindowInfo', 9490) ? mini.getWindowInfo() : null; },
      vibrate: async function () {
        if (target === 'minitool') {
          if (!supported('vibrateShort', 9500)) throw Error('当前容器无可用短振 API');
          await mini.vibrateShort({ type: 'heavy' }); return '短振调用成功，是否有体感请记录';
        }
        if (!env.navigator || typeof env.navigator.vibrate !== 'function' || !env.navigator.vibrate(20)) throw Error('此浏览器无可用震动，核心双指测试可继续');
        return '已请求一次短振，是否有体感请记录';
      }
    };
  }
  root.BagenPlatform = { create: createPlatform };
})(typeof window === 'undefined' ? globalThis : window);
