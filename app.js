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

        if (openid) {
            // 已登录，获取用户信息
            const db = wx.cloud.database();
            db.collection('users').doc(openid).get({
                success: res => {
                    this.globalData.userInfo = res.data;
                    this.globalData.isLogin = true;
                    this.globalData.openid = openid;

                    // 如果有回调函数，执行回调
                    if (this.userInfoReadyCallback) {
                        this.userInfoReadyCallback(res.data);
                    }
                },
                fail: () => {
                    // 获取失败，清除openid
                    wx.removeStorageSync('openid');
                    this.globalData.isLogin = false;
                }
            });
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
                    // 调用云函数获取openid
                    wx.cloud.callFunction({
                        name: 'login',
                        data: {},
                        success: result => {
                            wx.hideLoading();

                            const openid = result.result.openid;
                            this.globalData.openid = openid;
                            wx.setStorageSync('openid', openid);

                            // 判断是新用户还是老用户
                            if (result.result.isNew) {
                                // 新用户，使用默认信息
                                this.globalData.userInfo = {
                                    nickname: '微信用户',
                                    avatarUrl: '/images/default-avatar.png'
                                };
                            } else {
                                // 老用户，使用已有信息
                                this.globalData.userInfo = result.result.user;
                            }

                            this.globalData.isLogin = true;
                            resolve(this.globalData.userInfo);
                        },
                        fail: err => {
                            wx.hideLoading();
                            console.error('云函数调用失败', err);
                            wx.showToast({
                                title: '登录失败',
                                icon: 'none'
                            });
                            reject(err);
                        }
                    });
                },
                fail: err => {
                    wx.hideLoading();
                    console.error('微信登录失败', err);
                    wx.showToast({
                        title: '登录失败',
                        icon: 'none'
                    });
                    reject(err);
                }
            });
        });
    },

    // 获取用户信息并保存到数据库
    saveUserInfo: function (userInfo) {
        this.globalData.userInfo = userInfo;
        this.globalData.isLogin = true;
        wx.setStorageSync('userInfo', userInfo);

        // 将用户信息保存到数据库
        const db = wx.cloud.database();
        db.collection('users').doc(this.globalData.openid).get({
            success: res => {
                // 用户已存在，更新信息
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