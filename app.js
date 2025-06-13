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
        this.getLoginStatus();
    },

    // 全局数据
    globalData: {
        userInfo: null,
        isLogin: false,
        openid: null
    },

    // 获取登录状态
    getLoginStatus: function () {
        const userInfo = wx.getStorageSync('userInfo');
        const openid = wx.getStorageSync('openid');

        if (userInfo && openid) {
            this.globalData.userInfo = userInfo;
            this.globalData.isLogin = true;
            this.globalData.openid = openid;
        }
    },

    // 登录方法
    login: function () {
        return new Promise((resolve, reject) => {
            wx.login({
                success: res => {
                    // 调用云函数获取openid
                    wx.cloud.callFunction({
                        name: 'login',
                        data: {},
                        success: result => {
                            const openid = result.result.openid;
                            this.globalData.openid = openid;
                            wx.setStorageSync('openid', openid);
                            resolve(openid);
                        },
                        fail: err => {
                            console.error('云函数调用失败', err);
                            reject(err);
                        }
                    });
                },
                fail: err => {
                    console.error('微信登录失败', err);
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