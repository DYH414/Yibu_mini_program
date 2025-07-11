// app.js - 小程序主应用文件
App({
    onLaunch: function () {
        // 初始化云环境
        if (!wx.cloud) {
            console.error('请使用 2.2.3 或以上的基础库以使用云能力')
        } else {
            wx.cloud.init({
                env: 'cloudbase-0gdnnqax782f54fa', // 云环境ID，已更新为实际环境ID
                traceUser: true,
            })

            // 临时注释掉，等待云函数依赖问题解决后再启用
            // this.initDataCache()
        }

        // 获取用户信息
        this.checkLoginStatus();

        // 初始化缓存服务
        this.initCacheService();
    },

    // 初始化缓存服务
    initCacheService: function () {
        this.cache = {
            // 缓存数据
            data: {},
            // 缓存时间记录
            timestamps: {},
            // 缓存类型映射，用于分组管理缓存
            typeMap: {},
            // 默认缓存时间（3分钟）
            defaultExpireTime: 3 * 60 * 1000,
            // 最长缓存时间（10分钟，无论是否被访问）
            maxExpireTime: 10 * 60 * 1000,

            // 设置缓存
            set: function (key, value, expireTime = this.defaultExpireTime, type = null) {
                const now = Date.now();
                this.data[key] = value;
                this.timestamps[key] = {
                    time: now,
                    lastAccess: now,
                    expire: expireTime,
                    maxExpire: now + this.maxExpireTime
                };

                // 如果指定了类型，添加到类型映射
                if (type) {
                    if (!this.typeMap[type]) {
                        this.typeMap[type] = new Set();
                    }
                    this.typeMap[type].add(key);
                }
            },

            // 获取缓存
            get: function (key) {
                const now = Date.now();
                const timestamp = this.timestamps[key];

                // 检查缓存是否存在且未过期
                if (timestamp) {
                    // 检查是否超过最大缓存时间
                    if (now > timestamp.maxExpire) {
                        this.remove(key);
                        return null;
                    }

                    // 检查是否在过期时间内
                    if (now - timestamp.time < timestamp.expire) {
                        // 更新最后访问时间
                        timestamp.lastAccess = now;
                        return this.data[key];
                    }
                }

                // 缓存不存在或已过期
                return null;
            },

            // 清除指定缓存
            remove: function (key) {
                // 从类型映射中移除
                for (const type in this.typeMap) {
                    if (this.typeMap[type].has(key)) {
                        this.typeMap[type].delete(key);
                    }
                }

                delete this.data[key];
                delete this.timestamps[key];
            },

            // 清除所有缓存
            clear: function () {
                this.data = {};
                this.timestamps = {};
                this.typeMap = {};
            },

            // 清除过期缓存
            clearExpired: function () {
                const now = Date.now();
                for (const key in this.timestamps) {
                    const timestamp = this.timestamps[key];
                    if (now - timestamp.time >= timestamp.expire || now > timestamp.maxExpire) {
                        this.remove(key);
                    }
                }
            },

            // 按前缀使缓存失效
            invalidateByPrefix: function (prefix) {
                const keysToRemove = [];
                for (const key in this.data) {
                    if (key.startsWith(prefix)) {
                        keysToRemove.push(key);
                    }
                }

                keysToRemove.forEach(key => this.remove(key));
                return keysToRemove.length;
            },

            // 按类型使缓存失效
            invalidateByType: function (type) {
                if (!this.typeMap[type]) return 0;

                const keys = Array.from(this.typeMap[type]);
                keys.forEach(key => this.remove(key));

                this.typeMap[type] = new Set();
                return keys.length;
            },

            // 刷新缓存（更新时间戳但不改变数据）
            refresh: function (key) {
                if (this.timestamps[key]) {
                    const now = Date.now();
                    this.timestamps[key].time = now;
                    this.timestamps[key].lastAccess = now;
                    return true;
                }
                return false;
            }
        };

        // 定期清理过期缓存（每5分钟）
        setInterval(() => {
            this.cache.clearExpired();
        }, 5 * 60 * 1000);

        // 初始化缓存事件系统
        this.initCacheEvents();
    },

    // 初始化缓存事件系统
    initCacheEvents: function () {
        // 缓存事件监听器
        this.cacheEvents = {
            listeners: {},

            // 添加事件监听器
            on: function (event, callback) {
                if (!this.listeners[event]) {
                    this.listeners[event] = [];
                }
                this.listeners[event].push(callback);
            },

            // 触发事件
            emit: function (event, data) {
                if (this.listeners[event]) {
                    this.listeners[event].forEach(callback => {
                        try {
                            callback(data);
                        } catch (e) {
                            console.error('缓存事件处理错误:', e);
                        }
                    });
                }
            }
        };

        // 监听小程序显示事件，可用于从后台恢复时刷新数据
        wx.onAppShow(() => {
            console.log('小程序从后台恢复');
            // 如果后台时间超过一定阈值，可以清除所有缓存
            if (this.backgroundTime && (Date.now() - this.backgroundTime > 5 * 60 * 1000)) {
                console.log('后台时间超过5分钟，清除所有缓存');
                this.cache.clear();
                this.cacheEvents.emit('cacheCleared', {});
            }
            this.backgroundTime = null;
        });

        // 监听小程序隐藏事件
        wx.onAppHide(() => {
            console.log('小程序进入后台');
            this.backgroundTime = Date.now();
        });
    },

    // 使特定类型的缓存失效
    invalidateCache: function (type) {
        const count = this.cache.invalidateByType(type);
        console.log(`已使${count}个${type}类型的缓存失效`);
        this.cacheEvents.emit('cacheInvalidated', { type });
        return count;
    },

    // 使特定前缀的缓存失效
    invalidateCacheByPrefix: function (prefix) {
        const count = this.cache.invalidateByPrefix(prefix);
        console.log(`已使${count}个以"${prefix}"为前缀的缓存失效`);
        this.cacheEvents.emit('cacheInvalidated', { prefix });
        return count;
    },

    // 全局数据
    globalData: {
        userInfo: null,
        isLogin: false,
        openid: null
    },

    // 获取登录状态
    checkLoginStatus: function () {
        const openid = wx.getStorageSync('openid');
        console.log('检查登录状态, openid:', openid);

        if (openid) {
            // 已登录，获取用户信息
            const db = wx.cloud.database();
            db.collection('users').doc(openid).get({
                success: res => {
                    console.log('获取用户信息成功:', res.data);

                    // 确保数据完整性
                    if (!res.data || !res.data._id) {
                        console.error('用户数据不完整:', res.data);
                        wx.removeStorageSync('openid');
                        wx.removeStorageSync('userInfo');
                        this.globalData.isLogin = false;
                        this.globalData.userInfo = null;
                        this.globalData.openid = null;
                        return;
                    }

                    // 确保使用最新的用户信息
                    this.globalData.userInfo = res.data;
                    this.globalData.isLogin = true;
                    this.globalData.openid = openid;

                    // 更新本地存储中的用户信息
                    wx.setStorageSync('userInfo', res.data);
                    console.log('全局用户信息已更新:', this.globalData.userInfo);

                    // 如果有回调函数，执行回调
                    if (this.userInfoReadyCallback) {
                        this.userInfoReadyCallback(res.data);
                    }
                },
                fail: err => {
                    // 获取失败，清除openid
                    console.error('获取用户信息失败:', err);
                    wx.removeStorageSync('openid');
                    wx.removeStorageSync('userInfo');
                    this.globalData.isLogin = false;
                    this.globalData.userInfo = null;
                    this.globalData.openid = null;
                }
            });
        } else {
            // 未登录，确保全局状态一致
            console.log('未登录，清除用户信息');
            this.globalData.isLogin = false;
            this.globalData.userInfo = null;
            this.globalData.openid = null;
        }
    },

    // 登录方法
    login: function () {
        return new Promise((resolve, reject) => {
            wx.showLoading({
                title: '登录中...',
            });

            wx.login({
                success: res => {
                    console.log('wx.login成功, code:', res.code);
                    // 调用云函数获取openid
                    wx.cloud.callFunction({
                        name: 'login',
                        data: {},
                        success: result => {
                            console.log('云函数login调用成功, 结果:', result.result);
                            const openid = result.result.openid;
                            const userData = result.result.user;

                            this.globalData.openid = openid;
                            wx.setStorageSync('openid', openid);

                            // 如果云函数返回了用户数据，直接使用
                            if (userData) {
                                console.log('云函数返回的用户数据:', userData);
                                this.globalData.userInfo = userData;
                                this.globalData.isLogin = true;
                                wx.setStorageSync('userInfo', userData);

                                wx.hideLoading();
                                resolve(userData);
                            } else {
                                // 如果没有返回用户数据，从数据库获取
                                console.log('云函数未返回用户数据，从数据库获取');
                                this.fetchUserFromDB(openid, resolve, reject);
                            }
                        },
                        fail: err => {
                            console.error('云函数login调用失败:', err);
                            wx.hideLoading();
                            wx.showToast({
                                title: '登录失败',
                                icon: 'none'
                            });
                            reject(err);
                        }
                    });
                },
                fail: err => {
                    console.error('wx.login失败:', err);
                    wx.hideLoading();
                    wx.showToast({
                        title: '登录失败',
                        icon: 'none'
                    });
                    reject(err);
                }
            });
        });
    },

    // 从数据库获取用户信息
    fetchUserFromDB: function (openid, resolve, reject) {
        const db = wx.cloud.database();

        db.collection('users').doc(openid).get({
            success: res => {
                console.log('从数据库获取用户信息成功:', res.data);
                this.globalData.userInfo = res.data;
                this.globalData.isLogin = true;
                wx.setStorageSync('userInfo', res.data);

                wx.hideLoading();
                resolve(res.data);
            },
            fail: err => {
                console.error('从数据库获取用户信息失败:', err);

                // 创建默认用户信息
                const defaultUserInfo = {
                    _id: openid,
                    nickname: '微信用户',
                    avatarUrl: '/images/default-avatar.png'
                };

                // 尝试创建新用户
                db.collection('users').add({
                    data: {
                        _id: openid,
                        ...defaultUserInfo,
                        createTime: db.serverDate()
                    }
                }).then(() => {
                    console.log('创建新用户成功');
                    this.globalData.userInfo = defaultUserInfo;
                    this.globalData.isLogin = true;
                    wx.setStorageSync('userInfo', defaultUserInfo);

                    wx.hideLoading();
                    resolve(defaultUserInfo);
                }).catch(addErr => {
                    console.error('创建用户失败:', addErr);

                    // 如果是因为用户已存在，尝试再次获取用户信息
                    if (addErr.errCode === -502001) {
                        db.collection('users').doc(openid).get().then(res => {
                            console.log('用户已存在，获取信息成功:', res.data);
                            this.globalData.userInfo = res.data;
                            this.globalData.isLogin = true;
                            wx.setStorageSync('userInfo', res.data);

                            wx.hideLoading();
                            resolve(res.data);
                        }).catch(getErr => {
                            console.error('获取已存在用户信息失败:', getErr);
                            this.globalData.userInfo = defaultUserInfo;
                            this.globalData.isLogin = true;
                            wx.setStorageSync('userInfo', defaultUserInfo);

                            wx.hideLoading();
                            resolve(defaultUserInfo);
                        });
                    } else {
                        this.globalData.userInfo = defaultUserInfo;
                        this.globalData.isLogin = true;
                        wx.setStorageSync('userInfo', defaultUserInfo);

                        wx.hideLoading();
                        resolve(defaultUserInfo);
                    }
                });
            }
        });
    },

    // 获取用户信息并保存到数据库
    saveUserInfo: function (userInfo) {
        console.log('保存用户信息:', userInfo);
        this.globalData.userInfo = userInfo;
        this.globalData.isLogin = true;
        wx.setStorageSync('userInfo', userInfo);

        // 将用户信息保存到数据库
        const db = wx.cloud.database();
        db.collection('users').doc(this.globalData.openid).get({
            success: res => {
                // 用户已存在，更新信息
                console.log('用户已存在，更新信息');
                db.collection('users').doc(this.globalData.openid).update({
                    data: {
                        nickname: userInfo.nickName,
                        avatarUrl: userInfo.avatarUrl,
                        updateTime: db.serverDate()
                    }
                });
            },
            fail: err => {
                // 用户不存在，创建新用户
                console.log('用户不存在，创建新用户');
                db.collection('users').doc(this.globalData.openid).set({
                    data: {
                        _id: this.globalData.openid,
                        nickname: userInfo.nickName,
                        avatarUrl: userInfo.avatarUrl,
                        createTime: db.serverDate()
                    }
                });
            }
        });
    },

    // 初始化数据库缓存集合
    initDataCache: function () {
        // 调用云函数初始化dataCache集合和TTL索引
        wx.cloud.callFunction({
            name: 'initDataCache',
            success: res => {
                console.log('初始化dataCache成功:', res.result)
            },
            fail: err => {
                console.error('初始化dataCache失败:', err)
            }
        })
    }
}) 