// 登录页 JS
const app = getApp()
import { userAgreement, privacyPolicy } from '../common/agreements.js'

Page({
    data: {
        isLoading: false,
        privacyChecked: false
    },

    onLoad: function (options) {
        // 检查是否已登录
        if (app.globalData.isLogin) {
            this.navigateBack()
        }
    },

    // 处理微信登录
    handleLogin: function () {
        if (this.data.isLoading || !this.data.privacyChecked) return

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
    },

    // 处理隐私政策复选框变化
    handlePrivacyChange: function (e) {
        this.setData({
            privacyChecked: e.detail.value.length > 0
        })
    },

    // 处理拒绝按钮点击
    handleReject: function () {
        wx.showModal({
            title: '提示',
            content: '您需要同意隐私政策才能使用完整功能。如拒绝，将无法登录使用评分、评论等功能。',
            confirmText: '返回首页',
            cancelText: '再看看',
            success: (res) => {
                if (res.confirm) {
                    wx.switchTab({
                        url: '/pages/index/index'
                    })
                }
            }
        })
    },

    // 显示用户协议
    showUserAgreement: function () {
        wx.navigateTo({
            url: '/pages/agreement/agreement?type=userAgreement'
        })
    },

    // 显示隐私政策
    showPrivacyPolicy: function () {
        wx.navigateTo({
            url: '/pages/agreement/agreement?type=privacyPolicy'
        })
    }
}) 