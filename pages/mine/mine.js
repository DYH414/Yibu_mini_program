// 我的页面 JS
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Page({
    data: {
        userInfo: {},
        isLogin: false,
        favorites: [],
        ratings: [],
        favoriteCount: 0,
        ratingCount: 0,
        loading: true,
        activeTab: 'favorite', // 当前激活的标签页：favorite, rating
        showContactModal: false,
        phoneNumber: '17805978513'
    },

    onLoad: function (options) {
        this.checkLoginStatus()

        // 清理所有用户的重复收藏记录
        this.cleanAllDuplicates()
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
            // 强制清除收藏缓存，确保每次显示页面时都获取最新数据
            const userInfo = app.globalData.userInfo;
            const userOpenId = userInfo._id || userInfo.openid;
            if (userOpenId) {
                const cacheKey = `user_favorites_${userOpenId}`;
                app.cache.remove(cacheKey);
                console.log('页面显示，强制清除收藏缓存:', cacheKey);
            }

            // 加载用户数据
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
                ratings: [],
                favoriteCount: 0,
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
            case 'rating':
                this.loadRatings()
                break
        }

        // 获取各个数据的计数
        this.getDataCounts()
    },

    // 获取各类数据的数量
    getDataCounts: function () {
        const userInfo = app.globalData.userInfo;
        const userOpenId = userInfo._id || userInfo.openid;

        if (!userOpenId) {
            console.error('无法获取用户ID');
            return;
        }

        console.log('获取数据计数，用户ID:', userOpenId);

        // 使用云函数获取收藏数量
        wx.cloud.callFunction({
            name: 'manageFavorite',
            data: {
                action: 'list'
            }
        }).then(res => {
            if (res.result && res.result.success) {
                const favorites = res.result.data || [];

                // 使用Set来存储已收藏的商家ID，自动去重
                const merchantIds = new Set();
                favorites.forEach(favorite => {
                    merchantIds.add(favorite.merchantId);
                });

                // Set的size属性即为不同商家的数量
                this.setData({
                    favoriteCount: merchantIds.size
                });
            } else {
                // 如果云函数调用失败，回退到直接查询
                this.getDataCountsFromDB();
            }
        }).catch(err => {
            console.error('获取收藏数量失败', err);
            // 如果云函数调用失败，回退到直接查询
            this.getDataCountsFromDB();
        });

        // 获取评分数量
        db.collection('ratings')
            .where({
                userOpenId: userOpenId
            })
            .count()
            .then(res => {
                this.setData({
                    ratingCount: res.total
                })
            })
            .catch(err => {
                console.error('获取评分数量失败', err)
            })
    },

    // 直接从数据库获取数据计数
    getDataCountsFromDB: function () {
        const userInfo = app.globalData.userInfo;
        const userOpenId = userInfo._id || userInfo.openid;

        if (!userOpenId) {
            console.error('无法获取用户ID');
            return;
        }

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
            .catch(err => {
                console.error('获取收藏数量失败', err)
            })
    },

    // 加载收藏数据
    loadFavorites: function () {
        const userInfo = app.globalData.userInfo;
        const userOpenId = userInfo._id || userInfo.openid;

        if (!userOpenId) {
            console.error('无法获取用户ID');
            this.setData({ loading: false });
            return;
        }

        console.log('加载收藏数据，用户ID:', userOpenId);

        // 构建缓存键
        const cacheKey = `user_favorites_${userOpenId}`;

        // 使用云函数获取收藏数据
        wx.cloud.callFunction({
            name: 'manageFavorite',
            data: {
                action: 'list'
            }
        }).then(res => {
            console.log('云函数获取收藏数据成功:', res);

            if (res.result && res.result.success) {
                // 处理收藏数据
                this.processFavorites(res.result.data || []);
            } else {
                console.error('云函数返回错误:', res.result);
                // 如果云函数调用失败，回退到直接查询
                this.loadFavoritesFromDB();
            }
        }).catch(err => {
            console.error('调用云函数失败:', err);
            // 如果云函数调用失败，回退到直接查询
            this.loadFavoritesFromDB();
        });
    },

    // 直接从数据库加载收藏数据
    loadFavoritesFromDB: function () {
        const userInfo = app.globalData.userInfo;
        const userOpenId = userInfo._id || userInfo.openid;

        db.collection('favorites')
            .where({
                userOpenId: userOpenId
            })
            .orderBy('timestamp', 'desc')
            .get()
            .then(res => {
                // 处理收藏数据
                this.processFavorites(res.data);
            })
            .catch(err => {
                console.error('获取收藏失败', err);
                this.setData({ loading: false });
            });
    },

    // 处理收藏数据
    processFavorites: function (favorites) {
        if (!favorites || favorites.length === 0) {
            this.setData({
                favorites: [],
                loading: false
            });
            return;
        }

        // 提取所有商家ID
        const merchantIds = favorites.map(f => f.merchantId);

        // 批量获取商家信息
        const _ = db.command;
        db.collection('merchants')
            .where({
                _id: _.in(merchantIds)
            })
            .get()
            .then(res => {
                const merchants = res.data;
                const merchantMap = {};

                // 创建商家ID到商家信息的映射
                merchants.forEach(m => {
                    merchantMap[m._id] = m;
                });

                // 合并收藏和商家信息
                const processedFavorites = favorites.map(favorite => {
                    return {
                        ...favorite,
                        merchant: merchantMap[favorite.merchantId] || {
                            name: '未知商家',
                            description: '该商家可能已被删除',
                            logoUrl: '/images/default-logo.png'
                        }
                    };
                });

                this.setData({
                    favorites: processedFavorites,
                    loading: false
                });
            })
            .catch(err => {
                console.error('获取商家信息失败', err);
                this.setData({ loading: false });
            });
    },

    // 加载评分数据
    loadRatings: function () {
        const userInfo = app.globalData.userInfo;
        const userOpenId = userInfo._id || userInfo.openid;

        db.collection('ratings')
            .where({
                userOpenId: userOpenId
            })
            .orderBy('timestamp', 'desc')
            .get()
            .then(res => {
                const ratings = res.data;

                if (ratings.length === 0) {
                    this.setData({
                        ratings: [],
                        loading: false
                    });
                    return;
                }

                // 提取所有商家ID
                const merchantIds = ratings.map(r => r.merchantId);

                // 批量获取商家信息
                const _ = db.command;
                db.collection('merchants')
                    .where({
                        _id: _.in(merchantIds)
                    })
                    .get()
                    .then(res => {
                        const merchants = res.data;
                        const merchantMap = {};

                        // 创建商家ID到商家信息的映射
                        merchants.forEach(m => {
                            merchantMap[m._id] = m;
                        });

                        // 处理评分数据
                        const processedRatings = ratings.map(rating => {
                            // 处理时间
                            let formattedTime = '';
                            if (rating.timestamp) {
                                const date = new Date(rating.timestamp);
                                formattedTime = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
                            }

                            // 生成星星数组
                            const starArray = [];
                            for (let i = 0; i < 5; i++) {
                                starArray.push(i < rating.score ? 'full' : 'empty');
                            }

                            return {
                                ...rating,
                                formattedTime,
                                starArray,
                                merchant: merchantMap[rating.merchantId] || {
                                    name: '未知商家',
                                    description: '该商家可能已被删除',
                                    logoUrl: '/images/default-logo.png'
                                }
                            };
                        });

                        this.setData({
                            ratings: processedRatings,
                            loading: false
                        });
                    })
                    .catch(err => {
                        console.error('获取商家信息失败', err);
                        this.setData({ loading: false });
                    });
            })
            .catch(err => {
                console.error('获取评分失败', err);
                this.setData({ loading: false });
            });
    },

    // 取消收藏
    cancelFavorite: function (e) {
        const id = e.currentTarget.dataset.id
        const index = this.data.favorites.findIndex(f => f._id === id)

        if (index === -1) return

        wx.showLoading({
            title: '处理中',
            mask: true
        })

        db.collection('favorites').doc(id).remove()
            .then(() => {
                wx.hideLoading()
                wx.showToast({
                    title: '已取消收藏',
                    icon: 'success'
                })

                // 更新收藏列表
                const favorites = [...this.data.favorites]
                favorites.splice(index, 1)

                this.setData({
                    favorites: favorites,
                    favoriteCount: Math.max(0, this.data.favoriteCount - 1)
                })
            })
            .catch(err => {
                wx.hideLoading()
                console.error('取消收藏失败', err)
                wx.showToast({
                    title: '操作失败，请重试',
                    icon: 'none'
                })
            })
    },

    // 清理所有用户的重复收藏记录
    cleanAllDuplicates: function () {
        console.log('清理所有用户的重复记录')
        wx.cloud.callFunction({
            name: 'cleanAllDuplicates',
            success: res => {
                console.log('清理重复记录成功:', res.result)
            },
            fail: err => {
                console.error('清理重复记录失败:', err)
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

    // 跳转到商家详情页
    goToMerchantDetail: function (e) {
        const id = e.currentTarget.dataset.id
        wx.navigateTo({
            url: '/pages/merchant/detail?id=' + id
        })
    },

    // 跳转到首页
    goToIndex: function () {
        wx.switchTab({
            url: '/pages/index/index'
        })
    },

    // 跳转到登录页
    goToLogin: function () {
        wx.navigateTo({
            url: '/pages/login/login'
        })
    },

    // 跳转到个人资料编辑页
    goToEditProfile: function () {
        wx.navigateTo({
            url: '/pages/profile/edit'
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

    // 复制手机号
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
            phoneNumber: this.data.phoneNumber
        })
    },

    // 阻止事件冒泡
    stopPropagation: function () {
        return
    },

    // 退出登录
    logout: function () {
        wx.showModal({
            title: '退出登录',
            content: '确定要退出登录吗？',
            success: res => {
                if (res.confirm) {
                    // 清除登录状态
                    app.globalData.isLogin = false
                    app.globalData.userInfo = null
                    app.globalData.openid = ''

                    // 清除本地存储
                    wx.removeStorageSync('userInfo')

                    // 更新页面状态
                    this.setData({
                        isLogin: false,
                        userInfo: {},
                        favorites: [],
                        ratings: [],
                        favoriteCount: 0,
                        ratingCount: 0
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