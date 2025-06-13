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
            .then(userInfo => {
                // 登录成功，显示提示
                wx.showToast({
                    title: '登录成功',
                    icon: 'success'
                })

                // 返回上一页
                this.navigateBack()
            })
            .catch(err => {
                console.error('登录失败', err)
                this.setData({ isLoading: false })
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