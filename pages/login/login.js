// 登录页 JS
const app = getApp()

Page({
    data: {
        isLoading: false
    },

    onLoad: function (options) {
        // 检查是否已登录
        if (app.globalData.isLogin) {
            this.navigateBack()
        }
    },

    // 处理微信登录
    handleLogin: function () {
        if (this.data.isLoading) return

        this.setData({ isLoading: true })

        // 登录微信获取openid
        app.login()
            .then(openid => {
                // 获取用户信息
                return this.getUserProfile()
            })
            .then(userInfo => {
                // 保存用户信息
                app.saveUserInfo(userInfo)

                // 返回上一页
                this.navigateBack()
            })
            .catch(err => {
                console.error('登录失败', err)
                this.setData({ isLoading: false })
                wx.showToast({
                    title: '登录失败',
                    icon: 'none'
                })
            })
    },

    // 获取用户信息
    getUserProfile: function () {
        return new Promise((resolve, reject) => {
            wx.getUserProfile({
                desc: '用于完善个人资料',
                success: (res) => {
                    resolve(res.userInfo)
                },
                fail: (err) => {
                    reject(err)
                }
            })
        })
    },

    // 返回上一页
    navigateBack: function () {
        const pages = getCurrentPages()
        if (pages.length > 1) {
            wx.navigateBack()
        } else {
            wx.switchTab({
                url: '/pages/index/index'
            })
        }
    }
}) 