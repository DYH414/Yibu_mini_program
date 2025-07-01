// 商家详情页 JS
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Page({
    data: {
        merchantId: '',
        merchant: null,
        platforms: [],
        userRating: 0,
        isLogin: false,
        userOpenid: '',
        isFavorite: false,
        loading: true,
        ratingSubmitting: false,
        favoriteAnimating: false, // 收藏按钮动画状态
        ratingStars: [], // 评分星星数组
    },

    onLoad: function (options) {
        // 获取商家ID
        const merchantId = options.id;

        if (!merchantId) {
            wx.showToast({
                title: '商家ID不能为空',
                icon: 'none',
                success: () => {
                    setTimeout(() => {
                        wx.navigateBack();
                    }, 1500);
                }
            });
            return;
        }

        this.setData({
            merchantId: merchantId,
            loading: true
        });

        // 检查是否是首次使用，如果是则显示收藏按钮提示
        const hasShownFavoriteTip = wx.getStorageSync('hasShownFavoriteTip');
        if (!hasShownFavoriteTip) {
            setTimeout(() => {
                wx.showToast({
                    title: '点击右上角可收藏商家',
                    icon: 'none',
                    duration: 3000
                });
                wx.setStorageSync('hasShownFavoriteTip', true);
            }, 1500);
        }

        // 获取用户登录状态
        this.checkLoginStatus();

        // 使用云函数加载商家详情（优化性能）
        this.loadMerchantDetailWithCloud();

        // 更新商家点击量
        this.updateMerchantClicks(merchantId);
    },

    onShow: function () {
        // 每次页面显示时重新检查登录状态
        this.checkLoginStatus()
    },

    onPullDownRefresh: function () {
        this.loadMerchantDetailWithCloud(); // 统一入口，优先云函数
    },

    // 检查登录状态
    checkLoginStatus: function () {
        const isLogin = app.globalData.isLogin
        const openid = app.globalData.openid

        this.setData({
            isLogin: isLogin,
            userOpenid: openid || ''
        })

        // 登录状态变化或OpenID更新后，统一加载商家详情
        this.loadMerchantDetailWithCloud();
    },

    // 使用云函数加载商家详情（主入口）
    loadMerchantDetailWithCloud: function () {
        this.setData({ loading: true });

        // 获取app实例
        const app = getApp();

        // 构建缓存键
        const cacheKey = `merchant_detail_cloud_${this.data.merchantId}`;

        // 尝试从缓存获取数据
        const cachedData = app.cache.get(cacheKey);
        if (cachedData) {
            console.log('使用缓存的商家详情数据(云函数)');
            this.setData({
                merchant: cachedData.merchant,
                platforms: cachedData.merchant.platforms || [],
                ratingStars: this.generateRatingStars(cachedData.merchant.avgRating),
                userRating: cachedData.userRating,
                isFavorite: cachedData.isFavorite,
                loading: false
            });
            wx.stopPullDownRefresh();
            return;
        }

        // 调用云函数获取商家详情
        wx.cloud.callFunction({
            name: 'getMerchantDetail',
            data: {
                merchantId: this.data.merchantId,
                userOpenId: this.data.userOpenid // 传递用户openid以获取用户专属数据
            }
        }).then(res => {
            console.log('云函数获取商家详情成功:', res);

            if (res.result && res.result.success) {
                const data = res.result.data;
                const ratingStars = this.generateRatingStars(data.merchant.avgRating);
                this.setData({
                    merchant: data.merchant,
                    platforms: data.merchant.platforms || [],
                    ratingStars: ratingStars,
                    userRating: data.userRating,
                    isFavorite: data.isFavorite,
                    loading: false
                });
                app.cache.set(cacheKey, {
                    merchant: data.merchant,
                    userRating: data.userRating,
                    isFavorite: data.isFavorite
                }, 5 * 60 * 1000); // 5分钟缓存
            } else {
                console.error('云函数返回错误:', res.result);
                // 云函数失败时兜底本地加载
                this.loadMerchantData();
            }
            wx.stopPullDownRefresh();
        }).catch(err => {
            console.error('调用云函数失败:', err);
            // 云函数失败时兜底本地加载
            this.loadMerchantData();
            wx.stopPullDownRefresh();
        });
    },

    // 加载商家数据
    loadMerchantData: function () {
        this.setData({ loading: true });

        // 获取app实例
        const app = getApp();

        // 构建缓存键
        const cacheKey = `merchant_detail_${this.data.merchantId}`;

        // 尝试从缓存获取数据
        const cachedData = app.cache.get(cacheKey);
        if (cachedData) {
            console.log('使用缓存的商家详情数据');
            this.setData({
                merchant: cachedData.merchant,
                platforms: cachedData.platforms || [],
                ratingStars: cachedData.ratingStars,
                loading: false
            });

            // 分阶段加载其他数据
            setTimeout(() => {
                // 检查用户评分和收藏状态
                if (this.data.isLogin && this.data.userOpenid) {
                    this.checkUserRating();
                    this.checkFavoriteStatus();
                }
            }, 100);

            wx.stopPullDownRefresh();
            return;
        }

        db.collection('merchants').doc(this.data.merchantId).get()
            .then(res => {
                const merchant = res.data;

                // 设置基本商家信息
                this.setData({
                    merchant: merchant,
                    platforms: merchant.platforms || []
                });

                // 分阶段加载：先加载评分数据
                this.loadRatingData().then(() => {
                    // 缓存商家详情数据
                    app.cache.set(cacheKey, {
                        merchant: this.data.merchant,
                        platforms: this.data.platforms,
                        ratingStars: this.data.ratingStars
                    }, 10 * 60 * 1000); // 10分钟缓存
                });
            })
            .catch(err => {
                console.error('获取商家信息失败', err);
                this.setData({ loading: false });
                wx.stopPullDownRefresh();
                wx.showToast({
                    title: '获取商家信息失败',
                    icon: 'none'
                });
            });
    },

    // 加载评分数据
    loadRatingData: function () {
        // 获取app实例
        const app = getApp();

        // 构建缓存键
        const cacheKey = `merchant_ratings_${this.data.merchantId}`;

        // 尝试从缓存获取数据
        const cachedRatings = app.cache.get(cacheKey);
        if (cachedRatings) {
            console.log('使用缓存的评分数据');
            this.setData({
                'merchant.ratingCount': cachedRatings.ratingCount,
                'merchant.avgRating': cachedRatings.avgRating,
                ratingStars: cachedRatings.ratingStars,
                loading: false
            });

            wx.stopPullDownRefresh();
            return Promise.resolve();
        }

        return db.collection('ratings')
            .where({
                merchantId: this.data.merchantId
            })
            .get()
            .then(res => {
                const ratings = res.data;
                const ratingCount = ratings.length;
                let avgRating = 0;

                if (ratingCount > 0) {
                    const totalScore = ratings.reduce((sum, rating) => sum + rating.score, 0);
                    avgRating = (totalScore / ratingCount).toFixed(1);
                }

                // 生成评分星星数组
                const ratingStars = this.generateRatingStars(avgRating);

                // 缓存评分数据
                app.cache.set(cacheKey, {
                    ratingCount,
                    avgRating,
                    ratingStars
                }, 5 * 60 * 1000); // 5分钟缓存

                this.setData({
                    'merchant.ratingCount': ratingCount,
                    'merchant.avgRating': avgRating,
                    ratingStars: ratingStars,
                    loading: false
                });

                wx.stopPullDownRefresh();
                return Promise.resolve();
            })
            .catch(err => {
                console.error('获取评分信息失败', err);
                this.setData({ loading: false });
                wx.stopPullDownRefresh();
                return Promise.reject(err);
            });
    },

    // 生成评分星星数组
    generateRatingStars: function (rating) {
        const stars = [];
        const intRating = Math.floor(rating);
        const decimalPart = rating - intRating;

        // 添加实心星星
        for (let i = 0; i < intRating; i++) {
            stars.push('full');
        }

        // 添加半星（如果小数部分 >= 0.3 且 < 0.8）
        if (decimalPart >= 0.3 && decimalPart < 0.8 && stars.length < 5) {
            stars.push('half');
        }
        // 添加实心星（如果小数部分 >= 0.8）
        else if (decimalPart >= 0.8 && stars.length < 5) {
            stars.push('full');
        }

        // 添加空心星星
        while (stars.length < 5) {
            stars.push('empty');
        }

        return stars;
    },

    // 检查用户评分
    checkUserRating: function () {
        if (!this.data.isLogin) return

        db.collection('ratings')
            .where({
                merchantId: this.data.merchantId,
                userOpenId: this.data.userOpenid
            })
            .get()
            .then(res => {
                if (res.data && res.data.length > 0) {
                    this.setData({
                        userRating: res.data[0].score
                    })
                }
            })
    },

    // 检查收藏状态
    checkFavoriteStatus: function () {
        if (!this.data.isLogin) return

        // 使用云函数检查收藏状态，确保与添加/删除收藏操作保持一致
        wx.cloud.callFunction({
            name: 'manageFavorite',
            data: {
                action: 'check',
                merchantId: this.data.merchantId
            }
        }).then(res => {
            if (res.result && res.result.success) {
                // 设置收藏状态
                this.setData({
                    isFavorite: res.result.isFavorite
                })

                // 更新缓存
                const app = getApp()
                const cacheKey = `merchant_detail_cloud_${this.data.merchantId}`
                const cachedData = app.cache.get(cacheKey)
                if (cachedData) {
                    cachedData.isFavorite = res.result.isFavorite
                    app.cache.set(cacheKey, cachedData)
                }
            } else {
                console.error('检查收藏状态失败:', res)
            }
        }).catch(err => {
            console.error('调用云函数检查收藏状态失败:', err)
        })
    },

    // 提交评分
    submitRating: function (e) {
        const rating = e.currentTarget.dataset.rating

        if (!this.data.isLogin) {
            this.goToLogin()
            return
        }

        if (this.data.ratingSubmitting) return

        this.setData({ ratingSubmitting: true })

        // 检查用户是否已评分
        db.collection('ratings')
            .where({
                merchantId: this.data.merchantId,
                userOpenId: this.data.userOpenid
            })
            .get()
            .then(res => {
                if (res.data && res.data.length > 0) {
                    // 更新评分
                    db.collection('ratings').doc(res.data[0]._id).update({
                        data: {
                            score: rating,
                            timestamp: db.serverDate()
                        }
                    }).then(() => {
                        this.setData({
                            userRating: rating,
                            ratingSubmitting: false
                        })
                        this.loadRatingData()
                        wx.showToast({
                            title: '评分更新成功',
                            icon: 'success'
                        })
                    })
                } else {
                    // 新增评分
                    db.collection('ratings').add({
                        data: {
                            merchantId: this.data.merchantId,
                            userOpenId: this.data.userOpenid,
                            score: rating,
                            timestamp: db.serverDate()
                        }
                    }).then(() => {
                        this.setData({
                            userRating: rating,
                            ratingSubmitting: false
                        })
                        this.loadRatingData()
                        wx.showToast({
                            title: '评分成功',
                            icon: 'success'
                        })
                    })
                }
            })
            .catch(err => {
                console.error('提交评分失败', err)
                this.setData({ ratingSubmitting: false })
                wx.showToast({
                    title: '评分失败',
                    icon: 'none'
                })
            })
    },

    // 收藏/取消收藏
    toggleFavorite: function () {
        if (!this.data.isLogin) {
            this.goToLogin()
            return
        }

        // 防止重复点击
        if (this.data.favoriteAnimating) return

        // 设置动画状态
        this.setData({ favoriteAnimating: true })

        // 动画结束后移除动画状态
        setTimeout(() => {
            this.setData({ favoriteAnimating: false })
        }, 500)

        const isFavorite = this.data.isFavorite

        // 显示加载中提示
        wx.showLoading({
            title: isFavorite ? '取消收藏中...' : '收藏中...',
            mask: true
        })

        // 使用云函数处理收藏/取消收藏操作，确保原子性
        wx.cloud.callFunction({
            name: 'manageFavorite',
            data: {
                action: isFavorite ? 'removeByMerchant' : 'add',
                merchantId: this.data.merchantId
            }
        }).then(res => {
            wx.hideLoading()

            if (res.result && res.result.success) {
                // 更新收藏状态
                this.setData({
                    isFavorite: !isFavorite
                })

                // 显示操作结果
                wx.showToast({
                    title: isFavorite ? '已取消收藏' : '收藏成功',
                    icon: 'success'
                })

                // 更新缓存中的商家详情数据
                const app = getApp()
                const cacheKey = `merchant_detail_cloud_${this.data.merchantId}`
                const cachedData = app.cache.get(cacheKey)
                if (cachedData) {
                    cachedData.isFavorite = !isFavorite
                    app.cache.set(cacheKey, cachedData)
                }
            } else {
                // 操作失败
                console.error('收藏操作失败:', res)
                wx.showToast({
                    title: res.result.message || '操作失败',
                    icon: 'none'
                })
            }
        }).catch(err => {
            wx.hideLoading()
            console.error('调用云函数失败:', err)
            wx.showToast({
                title: '操作失败，请重试',
                icon: 'none'
            })
        })
    },

    // 跳转到平台小程序
    navigateToPlatform: function (e) {
        const appId = e.currentTarget.dataset.appid
        const platformName = e.currentTarget.dataset.name || '' // 获取平台名称

        if (!appId) {
            wx.showToast({
                title: '无法跳转到该平台',
                icon: 'none'
            })
            return
        }

        console.log('跳转到平台:', platformName, appId)

        wx.navigateToMiniProgram({
            appId: appId,
            success: function () {
                console.log('跳转成功')
            },
            fail: err => {
                console.error('跳转失败', err)

                // 判断是否为用户主动取消
                if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
                    console.log('用户取消跳转')
                    return // 用户主动取消，不显示错误提示
                }

                // 其他失败情况才显示提示
                wx.showToast({
                    title: '跳转失败',
                    icon: 'none'
                })
            }
        })
    },

    // 跳转到登录页
    goToLogin: function () {
        wx.navigateTo({
            url: '/pages/login/login'
        })
    },

    // 复制商家名称
    copyMerchantName: function () {
        const merchantName = this.data.merchant.name || '';
        if (!merchantName) {
            wx.showToast({
                title: '商家名称为空',
                icon: 'none'
            });
            return;
        }

        wx.setClipboardData({
            data: merchantName,
            success: function () {
                wx.showToast({
                    title: '已复制商家名称',
                    icon: 'success'
                });
            }
        });
    },

    // 更新商家点击量
    updateMerchantClicks: function (merchantId) {
        // 获取今天的日期字符串，格式：YYYY-MM-DD
        const today = new Date();
        const dateStr = today.getFullYear() + '-' +
            String(today.getMonth() + 1).padStart(2, '0') + '-' +
            String(today.getDate()).padStart(2, '0');

        // 使用云函数更新点击量，避免客户端权限问题
        wx.cloud.callFunction({
            name: 'updateMerchantClicks',
            data: {
                merchantId: merchantId,
                dateStr: dateStr
            }
        }).then(res => {
            console.log('更新点击量成功:', res);

            // 如果需要显示点击量，可以在这里获取并更新到页面
            if (res.result && res.result.success) {
                this.setData({
                    clicksData: res.result.data
                });
            }
        }).catch(err => {
            console.error('更新点击量失败:', err);
        });
    },
}) 