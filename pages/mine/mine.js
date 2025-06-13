// 我的页面 JS
const app = getApp()
const db = wx.cloud.database()

Page({
    data: {
        userInfo: null,
        isLogin: false,
        favoriteCount: 0,
        commentCount: 0,
        ratingCount: 0,
        favorites: [],
        loading: true
    },

    onLoad: function (options) {
        this.checkLoginStatus()
    },

    onShow: function () {
        // 每次显示页面时检查登录状态
        this.checkLoginStatus()

        // 如果已登录，加载用户数据
        if (this.data.isLogin) {
            this.loadUserData()
        }
    },

    // 检查登录状态
    checkLoginStatus: function () {
        const isLogin = app.globalData.isLogin
        const userInfo = app.globalData.userInfo

        this.setData({
            isLogin: isLogin,
            userInfo: userInfo
        })
    },

    // 加载用户数据
    loadUserData: function () {
        if (!this.data.isLogin) return

        this.setData({ loading: true })

        const openid = app.globalData.openid
        const tasks = [
            // 获取收藏数量和列表
            db.collection('favorites')
                .where({
                    userOpenId: openid
                })
                .get()
                .then(res => {
                    const favorites = res.data || []

                    // 加载收藏的商家详情
                    const merchantTasks = favorites.map(fav => {
                        return db.collection('merchants')
                            .doc(fav.merchantId)
                            .get()
                            .then(mRes => {
                                return {
                                    ...fav,
                                    merchant: mRes.data
                                }
                            })
                            .catch(() => {
                                return fav
                            })
                    })

                    return Promise.all(merchantTasks).then(updatedFavorites => {
                        this.setData({
                            favoriteCount: favorites.length,
                            favorites: updatedFavorites
                        })
                    })
                }),

            // 获取评论数量
            db.collection('comments')
                .where({
                    userOpenId: openid
                })
                .count()
                .then(res => {
                    this.setData({
                        commentCount: res.total
                    })
                }),

            // 获取评分数量
            db.collection('ratings')
                .where({
                    userOpenId: openid
                })
                .count()
                .then(res => {
                    this.setData({
                        ratingCount: res.total
                    })
                })
        ]

        Promise.all(tasks)
            .then(() => {
                this.setData({ loading: false })
            })
            .catch(err => {
                console.error('加载用户数据失败', err)
                this.setData({ loading: false })
            })
    },

    // 跳转到商家详情
    goToMerchantDetail: function (e) {
        const merchantId = e.currentTarget.dataset.id
        wx.navigateTo({
            url: `/pages/merchant/detail?id=${merchantId}`
        })
    },

    // 取消收藏
    cancelFavorite: function (e) {
        const favoriteId = e.currentTarget.dataset.id

        wx.showLoading({ title: '处理中...' })

        db.collection('favorites').doc(favoriteId).remove()
            .then(() => {
                // 更新收藏列表
                const favorites = this.data.favorites.filter(fav => fav._id !== favoriteId)

                this.setData({
                    favorites: favorites,
                    favoriteCount: favorites.length
                })

                wx.hideLoading()
                wx.showToast({
                    title: '已取消收藏',
                    icon: 'success'
                })
            })
            .catch(err => {
                console.error('取消收藏失败', err)
                wx.hideLoading()
                wx.showToast({
                    title: '操作失败',
                    icon: 'none'
                })
            })
    },

    // 跳转到登录页
    goToLogin: function () {
        wx.navigateTo({
            url: '/pages/login/login'
        })
    },

    // 退出登录
    logout: function () {
        wx.showModal({
            title: '提示',
            content: '确定要退出登录吗？',
            success: (res) => {
                if (res.confirm) {
                    // 清除本地存储
                    wx.removeStorageSync('userInfo')
                    wx.removeStorageSync('openid')

                    // 重置全局数据
                    app.globalData.userInfo = null
                    app.globalData.isLogin = false
                    app.globalData.openid = null

                    // 更新页面状态
                    this.setData({
                        isLogin: false,
                        userInfo: null,
                        favoriteCount: 0,
                        commentCount: 0,
                        ratingCount: 0,
                        favorites: []
                    })

                    wx.showToast({
                        title: '已退出登录',
                        icon: 'success'
                    })
                }
            }
        })
    }
}) 