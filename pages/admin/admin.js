// 管理员页面 JS
const app = getApp()

Page({
    data: {
        isAdmin: false,
        loading: false,
        result: null
    },

    onLoad: function () {
        // 检查是否是管理员
        const openid = app.globalData.openid
        if (openid === 'LIquidBounceUser') {
            this.setData({ isAdmin: true })
        }
    },

    // 修复商家分类
    fixMerchantCategory: function () {
        if (!this.data.isAdmin) {
            wx.showToast({
                title: '无权限',
                icon: 'none'
            })
            return
        }

        this.setData({ loading: true })
        wx.showLoading({ title: '修复中...' })

        wx.cloud.callFunction({
            name: 'fixMerchantCategory',
            success: res => {
                console.log('修复商家分类成功:', res.result)
                this.setData({
                    result: res.result,
                    loading: false
                })
                wx.hideLoading()
                wx.showToast({
                    title: '修复完成',
                    icon: 'success'
                })
            },
            fail: err => {
                console.error('修复商家分类失败:', err)
                this.setData({ loading: false })
                wx.hideLoading()
                wx.showToast({
                    title: '修复失败',
                    icon: 'none'
                })
            }
        })
    },

    // 返回首页
    goToIndex: function () {
        wx.switchTab({
            url: '/pages/index/index'
        })
    }
}) 