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
                    this.globalData.userInfo = res.data;
                    this.globalData.isLogin = true;
                    this.globalData.openid = openid;

                    // 如果有回调函数，执行回调
                    if (this.userInfoReadyCallback) {
                        this.userInfoReadyCallback(res.data);
                    }
                },
                fail: err => {
                    // 获取失败，清除openid
                    console.error('获取用户信息失败:', err);
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
                    console.log('wx.login成功, code:', res.code);
                    // 调用云函数获取openid
                    wx.cloud.callFunction({
                        name: 'login',
                        data: {},
                        success: result => {
                            console.log('云函数login调用成功, 结果:', result.result);
                            const openid = result.result.openid;
                            this.globalData.openid = openid;
                            wx.setStorageSync('openid', openid);

                            // 强制直接从数据库获取最新用户信息，避免缓存问题
                            const db = wx.cloud.database();
                            console.log('准备查询用户数据, openid:', openid);

                            // 使用get方法的options参数，禁用缓存
                            const options = {
                                success: res => {
                                    console.log('查询用户数据成功:', res.data);
                                    this.globalData.userInfo = res.data;
                                    this.globalData.isLogin = true;

                                    wx.hideLoading();
                                    resolve(this.globalData.userInfo);
                                },
                                fail: err => {
                                    console.error('查询用户数据失败:', err);

                                    // 使用默认信息
                                    this.globalData.userInfo = {
                                        nickname: '微信用户',
                                        avatarUrl: '/images/default-avatar.png'
                                    };
                                    this.globalData.isLogin = true;

                                    wx.hideLoading();
                                    resolve(this.globalData.userInfo);
                                }
                            };

                            // 直接调用get方法
                            db.collection('users').doc(openid).get(options);
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