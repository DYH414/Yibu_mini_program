// 我的页面 JS
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Page({
    data: {
        userInfo: {},
        isLogin: false,
        favorites: [],
        comments: [],
        ratings: [],
        favoriteCount: 0,
        commentCount: 0,
        ratingCount: 0,
        loading: true,
        activeTab: 'favorite', // 当前激活的标签页：favorite, comment, rating
        showContactModal: false,
        phoneNumber: '13800138000'
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
        const userInfo = app.globalData.userInfo
        if (userInfo && userInfo.openid) {
            this.setData({
                isLogin: true,
                userInfo: userInfo
            })
            this.loadUserData()
        } else {
            this.setData({
                isLogin: false,
                userInfo: {},
                favorites: [],
                comments: [],
                ratings: [],
                favoriteCount: 0,
                commentCount: 0,
                ratingCount: 0,
                loading: false
            })
        }
    },

    // 加载用户数据
    loadUserData: function () {
        this.setData({ loading: true })

        // 加载当前激活的标签页数据
        switch (this.data.activeTab) {
            case 'favorite':
                this.loadFavorites()
                break
            case 'comment':
                this.loadComments()
                break
            case 'rating':
                this.loadRatings()
                break
        }

        // 获取各个数据的计数
        this.getDataCounts()
    },

    // 获取各类数据的数量
    getDataCounts: function () {
        const userOpenId = app.globalData.userInfo.openid

        // 获取收藏数量
        db.collection('favorites')
            .where({
                userOpenId: userOpenId
            })
            .count()
            .then(res => {
                this.setData({
                    favoriteCount: res.total
                })
            })

        // 获取评论数量
        db.collection('comments')
            .where({
                userOpenId: userOpenId
            })
            .count()
            .then(res => {
                this.setData({
                    commentCount: res.total
                })
            })

        // 获取评分数量 - 修改为只统计不同商家的评分数量
        db.collection('ratings')
            .where({
                userOpenId: userOpenId
            })
            .get()
            .then(res => {
                // 使用Set来存储已评分的商家ID，自动去重
                const merchantIds = new Set()
                res.data.forEach(rating => {
                    merchantIds.add(rating.merchantId)
                })

                // Set的size属性即为不同商家的数量
                this.setData({
                    ratingCount: merchantIds.size
                })
            })
            .catch(err => {
                console.error('获取评分数量失败', err)
            })
    },

    // 加载收藏数据
    loadFavorites: function () {
        const userOpenId = app.globalData.userInfo.openid

        db.collection('favorites')
            .where({
                userOpenId: userOpenId
            })
            .orderBy('timestamp', 'desc')
            .get()
            .then(res => {
                const favorites = res.data

                // 如果没有收藏，直接设置空数组
                if (favorites.length === 0) {
                    this.setData({
                        favorites: [],
                        loading: false
                    })
                    return
                }

                // 获取所有商家ID
                const merchantIds = favorites.map(item => item.merchantId)

                // 批量获取商家信息
                const tasks = merchantIds.map(id => {
                    return db.collection('merchants').doc(id).get()
                })

                // 并行执行所有查询
                Promise.all(tasks)
                    .then(results => {
                        // 将商家信息添加到收藏数据中
                        const favoritesWithMerchant = favorites.map((favorite, index) => {
                            return {
                                ...favorite,
                                merchant: results[index].data
                            }
                        })

                        this.setData({
                            favorites: favoritesWithMerchant,
                            loading: false
                        })
                    })
                    .catch(err => {
                        console.error('获取商家信息失败', err)
                        this.setData({ loading: false })
                        wx.showToast({
                            title: '加载失败，请重试',
                            icon: 'none'
                        })
                    })
            })
            .catch(err => {
                console.error('获取收藏失败', err)
                this.setData({ loading: false })
                wx.showToast({
                    title: '加载失败，请重试',
                    icon: 'none'
                })
            })
    },

    // 加载评论数据
    loadComments: function () {
        const userOpenId = app.globalData.userInfo.openid

        db.collection('comments')
            .where({
                userOpenId: userOpenId
            })
            .orderBy('timestamp', 'desc')
            .get()
            .then(res => {
                const comments = res.data

                // 如果没有评论，直接设置空数组
                if (comments.length === 0) {
                    this.setData({
                        comments: [],
                        loading: false
                    })
                    return
                }

                // 获取所有商家ID
                const merchantIds = comments.map(item => item.merchantId)

                // 批量获取商家信息
                const tasks = merchantIds.map(id => {
                    return db.collection('merchants').doc(id).get()
                })

                // 并行执行所有查询
                Promise.all(tasks)
                    .then(results => {
                        // 将商家信息添加到评论数据中，并格式化时间
                        const commentsWithMerchant = comments.map((comment, index) => {
                            return {
                                ...comment,
                                merchant: results[index].data,
                                formattedTime: this.formatTime(comment.timestamp)
                            }
                        })

                        this.setData({
                            comments: commentsWithMerchant,
                            loading: false
                        })
                    })
                    .catch(err => {
                        console.error('获取商家信息失败', err)
                        this.setData({ loading: false })
                        wx.showToast({
                            title: '加载失败，请重试',
                            icon: 'none'
                        })
                    })
            })
            .catch(err => {
                console.error('获取评论失败', err)
                this.setData({ loading: false })
                wx.showToast({
                    title: '加载失败，请重试',
                    icon: 'none'
                })
            })
    },

    // 加载评分数据
    loadRatings: function () {
        const userOpenId = app.globalData.userInfo.openid

        db.collection('ratings')
            .where({
                userOpenId: userOpenId
            })
            .orderBy('timestamp', 'desc')
            .get()
            .then(res => {
                const allRatings = res.data;

                // 如果没有评分，直接设置空数组
                if (allRatings.length === 0) {
                    this.setData({
                        ratings: [],
                        loading: false
                    });
                    return;
                }

                // 对评分进行处理，只保留每个商家的最新评分
                const merchantMap = new Map(); // 用于存储每个商家的最新评分

                allRatings.forEach(rating => {
                    // 如果商家ID不在Map中，或者当前评分比Map中的更新，则更新Map
                    if (!merchantMap.has(rating.merchantId) ||
                        rating.timestamp > merchantMap.get(rating.merchantId).timestamp) {
                        merchantMap.set(rating.merchantId, rating);
                    }
                });

                // 将Map转换为数组
                const latestRatings = Array.from(merchantMap.values());

                // 获取所有商家ID
                const merchantIds = latestRatings.map(item => item.merchantId);

                // 批量获取商家信息
                const tasks = merchantIds.map(id => {
                    return db.collection('merchants').doc(id).get();
                });

                // 并行执行所有查询
                Promise.all(tasks)
                    .then(results => {
                        // 将商家信息添加到评分数据中，并格式化时间和星星数组
                        const ratingsWithMerchant = latestRatings.map((rating, index) => {
                            // 生成星星数组，用于展示
                            const starArray = [];
                            for (let i = 0; i < 5; i++) {
                                if (i < rating.score) {
                                    starArray.push('full');
                                } else {
                                    starArray.push('empty');
                                }
                            }

                            return {
                                ...rating,
                                merchant: results[index].data,
                                formattedTime: this.formatTime(rating.timestamp),
                                starArray: starArray
                            };
                        });

                        this.setData({
                            ratings: ratingsWithMerchant,
                            loading: false
                        });
                    })
                    .catch(err => {
                        console.error('获取商家信息失败', err);
                        this.setData({ loading: false });
                        wx.showToast({
                            title: '加载失败，请重试',
                            icon: 'none'
                        });
                    });
            })
            .catch(err => {
                console.error('获取评分失败', err);
                this.setData({ loading: false });
                wx.showToast({
                    title: '加载失败，请重试',
                    icon: 'none'
                });
            });
    },

    // 格式化时间
    formatTime: function (timestamp) {
        if (!timestamp) return ''

        const date = new Date(timestamp)
        const year = date.getFullYear()
        const month = (date.getMonth() + 1).toString().padStart(2, '0')
        const day = date.getDate().toString().padStart(2, '0')

        return `${year}-${month}-${day}`
    },

    // 取消收藏
    cancelFavorite: function (e) {
        const favoriteId = e.currentTarget.dataset.id

        wx.showModal({
            title: '取消收藏',
            content: '确定要取消收藏该商家吗？',
            success: res => {
                if (res.confirm) {
                    wx.showLoading({
                        title: '处理中',
                        mask: true
                    })

                    db.collection('favorites').doc(favoriteId).remove()
                        .then(() => {
                            wx.hideLoading()
                            wx.showToast({
                                title: '已取消收藏',
                                icon: 'success'
                            })

                            // 重新加载收藏数据
                            this.loadFavorites()
                            // 更新计数
                            this.getDataCounts()
                        })
                        .catch(err => {
                            wx.hideLoading()
                            console.error('取消收藏失败', err)
                            wx.showToast({
                                title: '操作失败，请重试',
                                icon: 'none'
                            })
                        })
                }
            }
        })
    },

    // 删除评论
    deleteComment: function (e) {
        const commentId = e.currentTarget.dataset.id

        wx.showModal({
            title: '删除评论',
            content: '确定要删除该评论吗？',
            success: res => {
                if (res.confirm) {
                    wx.showLoading({
                        title: '处理中',
                        mask: true
                    })

                    db.collection('comments').doc(commentId).remove()
                        .then(() => {
                            wx.hideLoading()
                            wx.showToast({
                                title: '评论已删除',
                                icon: 'success'
                            })

                            // 重新加载评论数据
                            this.loadComments()
                            // 更新计数
                            this.getDataCounts()
                        })
                        .catch(err => {
                            wx.hideLoading()
                            console.error('删除评论失败', err)
                            wx.showToast({
                                title: '操作失败，请重试',
                                icon: 'none'
                            })
                        })
                }
            }
        })
    },

    // 切换标签页
    switchTab: function (e) {
        const tab = e.currentTarget.dataset.tab

        if (tab === this.data.activeTab) {
            return // 如果点击的是当前标签，不做任何操作
        }

        this.setData({
            activeTab: tab,
            loading: true
        }, () => {
            // 加载对应标签页的数据
            this.loadUserData()
        })
    },

    // 前往商家详情页
    goToMerchantDetail: function (e) {
        const merchantId = e.currentTarget.dataset.id
        wx.navigateTo({
            url: `/pages/merchant/detail?id=${merchantId}`
        })
    },

    // 前往首页
    goToIndex: function () {
        wx.switchTab({
            url: '/pages/index/index'
        })
    },

    // 前往登录页
    goToLogin: function () {
        wx.navigateTo({
            url: '/pages/login/login'
        })
    },

    // 前往编辑资料页
    goToEditProfile: function () {
        wx.navigateTo({
            url: '/pages/profile/edit'
        })
    },

    // 退出登录
    logout: function () {
        wx.showModal({
            title: '退出登录',
            content: '确定要退出登录吗？',
            success: res => {
                if (res.confirm) {
                    app.globalData.userInfo = null
                    this.setData({
                        isLogin: false,
                        userInfo: {},
                        favorites: [],
                        favoriteCount: 0,
                        commentCount: 0,
                        ratingCount: 0
                    })
                    wx.showToast({
                        title: '已退出登录',
                        icon: 'success'
                    })
                }
            }
        })
    },

    // 显示联系客服弹窗
    contactService: function () {
        this.setData({
            showContactModal: true
        })
    },

    // 隐藏联系客服弹窗
    hideContactModal: function () {
        this.setData({
            showContactModal: false
        })
    },

    // 阻止冒泡
    stopPropagation: function () {
        return
    },

    // 复制电话号码
    copyPhoneNumber: function () {
        wx.setClipboardData({
            data: this.data.phoneNumber,
            success: () => {
                wx.showToast({
                    title: '号码已复制',
                    icon: 'success'
                })
            }
        })
    },

    // 拨打电话
    callPhoneNumber: function () {
        wx.makePhoneCall({
            phoneNumber: this.data.phoneNumber,
            fail: () => {
                wx.showToast({
                    title: '拨号取消',
                    icon: 'none'
                })
            }
        })
    }
}) 