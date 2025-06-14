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
        loading: true,
        showContactModal: false,
        phoneNumber: ''
    },

    onLoad: function (options) {
        this.checkLoginStatus()
    },

    onShow: function () {
        console.log('我的页面显示')
        // 每次显示页面时强制刷新用户信息
        if (app.globalData.isLogin && app.globalData.openid) {
            this.fetchLatestUserInfo()
        } else {
            // 检查登录状态
            this.checkLoginStatus()
        }

        // 如果已登录，加载用户数据
        if (this.data.isLogin) {
            this.loadUserData()
        }
    },

    // 获取最新用户信息
    fetchLatestUserInfo: function () {
        const openid = app.globalData.openid
        console.log('强制获取最新用户信息, openid:', openid)

        wx.showLoading({ title: '加载中...' })

        // 直接从数据库获取最新用户信息，禁用缓存
        db.collection('users').doc(openid).get({
            success: res => {
                console.log('获取最新用户信息成功:', res.data)

                // 确保获取到的是最新数据
                if (!res.data || !res.data.nickname) {
                    console.error('获取到的用户信息不完整:', res.data)
                    wx.hideLoading()
                    return
                }

                // 更新全局用户信息
                app.globalData.userInfo = res.data
                app.globalData.isLogin = true

                // 更新本地存储
                wx.setStorageSync('userInfo', res.data)

                // 更新页面数据
                this.setData({
                    userInfo: res.data,
                    isLogin: true
                })

                wx.hideLoading()

                // 加载用户数据
                this.loadUserData()
            },
            fail: err => {
                console.error('获取最新用户信息失败:', err)
                wx.hideLoading()

                // 如果获取失败，尝试使用全局数据
                if (app.globalData.userInfo) {
                    this.setData({
                        userInfo: app.globalData.userInfo,
                        isLogin: true
                    })
                    this.loadUserData()
                }
            }
        })
    },

    // 检查登录状态
    checkLoginStatus: function () {
        const isLogin = app.globalData.isLogin
        const userInfo = app.globalData.userInfo

        console.log('我的页面检查登录状态:', isLogin, userInfo)

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
        console.log('加载用户数据, openid:', openid)

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

    // 跳转到首页
    goToIndex: function () {
        wx.switchTab({
            url: '/pages/index/index'
        })
    },

    // 联系客服
    contactService: function () {
        // 设置要展示和复制的手机号
        const phoneNumber = '17805978513';

        // 显示联系客服弹窗
        this.setData({
            showContactModal: true,
            phoneNumber: phoneNumber
        });
    },

    // 复制手机号
    copyPhoneNumber: function () {
        const phoneNumber = this.data.phoneNumber;

        wx.setClipboardData({
            data: phoneNumber,
            success: () => {
                wx.showToast({
                    title: '已复制到剪贴板',
                    icon: 'success',
                    duration: 1500
                });

                // 2秒后关闭弹窗
                setTimeout(() => {
                    this.hideContactModal();
                }, 2000);
            }
        });
    },

    // 拨打电话
    callPhoneNumber: function () {
        const phoneNumber = this.data.phoneNumber;

        wx.makePhoneCall({
            phoneNumber: phoneNumber,
            fail: () => {
                wx.showToast({
                    title: '拨号取消',
                    icon: 'none'
                });
            }
        });
    },

    // 隐藏联系客服弹窗
    hideContactModal: function () {
        this.setData({
            showContactModal: false
        });
    },

    // 跳转到编辑个人信息页面
    goToEditProfile: function () {
        wx.navigateTo({
            url: '/pages/userEdit/userEdit'
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
    },

    // 阻止事件冒泡
    stopPropagation: function () {
        // 阻止点击事件冒泡
        return;
    },
}) 