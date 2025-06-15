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
        }

        // 获取用户信息
        this.checkLoginStatus();
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
    }
}) 