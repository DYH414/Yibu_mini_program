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
        comments: [],
        commentContent: '',
        isLogin: false,
        userOpenid: '',
        isFavorite: false,
        loading: true,
        commentLoading: false,
        ratingSubmitting: false,
        favoriteAnimating: false, // 收藏按钮动画状态
        ratingStars: [], // 评分星星数组
        emptyCommentImage: '/images/icons/empty-comment.png', // 空评论状态图片
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
    },

    onShow: function () {
        // 每次页面显示时重新检查登录状态
        this.checkLoginStatus()
    },

    onPullDownRefresh: function () {
        this.loadMerchantData()
    },

    // 检查登录状态
    checkLoginStatus: function () {
        const isLogin = app.globalData.isLogin
        const openid = app.globalData.openid

        this.setData({
            isLogin: isLogin,
            userOpenid: openid || ''
        })

        if (isLogin && openid) {
            this.checkUserRating()
            this.checkFavoriteStatus()
        }
    },

    // 使用云函数加载商家详情
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
                comments: cachedData.comments,
                userRating: cachedData.userRating,
                isFavorite: cachedData.isFavorite,
                loading: false,
                commentLoading: false
            });

            wx.stopPullDownRefresh();
            return;
        }

        // 调用云函数获取商家详情
        wx.cloud.callFunction({
            name: 'getMerchantDetail',
            data: {
                merchantId: this.data.merchantId
            }
        }).then(res => {
            console.log('云函数获取商家详情成功:', res);

            if (res.result && res.result.success) {
                const data = res.result.data;

                // 生成评分星星数组
                const ratingStars = this.generateRatingStars(data.merchant.avgRating);

                // 处理评论数据
                const processedComments = this.processComments(data.comments);

                // 更新页面数据
                this.setData({
                    merchant: data.merchant,
                    platforms: data.merchant.platforms || [],
                    ratingStars: ratingStars,
                    comments: processedComments,
                    userRating: data.userRating,
                    isFavorite: data.isFavorite,
                    loading: false,
                    commentLoading: false
                });

                // 缓存数据
                app.cache.set(cacheKey, {
                    merchant: data.merchant,
                    comments: processedComments,
                    userRating: data.userRating,
                    isFavorite: data.isFavorite
                }, 5 * 60 * 1000); // 5分钟缓存
            } else {
                console.error('云函数返回错误:', res.result);
                // 如果云函数调用失败，回退到分步加载
                this.loadMerchantData();
            }

            wx.stopPullDownRefresh();
        }).catch(err => {
            console.error('调用云函数失败:', err);
            // 如果云函数调用失败，回退到分步加载
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
                // 加载评论数据
                this.loadComments();

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

                    // 再加载评论数据
                    setTimeout(() => {
                        this.loadComments();
                    }, 100);
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

    // 加载评论数据
    loadComments: function () {
        this.setData({ commentLoading: true });

        // 获取app实例
        const app = getApp();

        // 构建缓存键
        const cacheKey = `merchant_comments_${this.data.merchantId}`;

        // 尝试从缓存获取数据
        const cachedComments = app.cache.get(cacheKey);
        if (cachedComments) {
            console.log('使用缓存的评论数据');

            // 处理评论的点赞状态
            const processedComments = this.processComments(cachedComments);

            this.setData({
                comments: processedComments,
                commentLoading: false
            });
            return;
        }

        db.collection('comments')
            .where({
                merchantId: this.data.merchantId
            })
            .orderBy('likes', 'desc')
            .get()
            .then(res => {
                const comments = res.data;

                // 缓存评论数据
                app.cache.set(cacheKey, comments, 3 * 60 * 1000); // 3分钟缓存

                if (comments.length === 0) {
                    this.setData({
                        comments: [],
                        commentLoading: false
                    });
                    return;
                }

                // 处理评论数据
                const processedComments = this.processComments(comments);

                this.setData({
                    comments: processedComments,
                    commentLoading: false
                });
            })
            .catch(err => {
                console.error('获取评论失败', err);
                this.setData({
                    commentLoading: false
                });
            });
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

        db.collection('favorites')
            .where({
                merchantId: this.data.merchantId,
                userOpenId: this.data.userOpenid
            })
            .get()
            .then(res => {
                // 设置收藏状态
                const isFavorite = res.data && res.data.length > 0
                this.setData({ isFavorite: isFavorite })

                // 如果发现重复收藏记录，使用云函数清理
                if (res.data && res.data.length > 1) {
                    console.log(`发现重复收藏记录，调用云函数清理`)

                    // 调用云函数清理重复收藏
                    wx.cloud.callFunction({
                        name: 'cleanAllDuplicates',
                        success: res => {
                            console.log('清理重复收藏成功:', res.result)
                        },
                        fail: err => {
                            console.error('清理重复收藏失败:', err)
                        }
                    })
                }
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

    // 提交评论
    submitComment: function () {
        if (!this.data.isLogin) {
            this.goToLogin()
            return
        }

        const content = this.data.commentContent.trim()

        if (!content) {
            wx.showToast({
                title: '评论内容不能为空',
                icon: 'none'
            })
            return
        }

        wx.showLoading({ title: '提交中...' })

        // 获取用户信息
        const userInfo = app.globalData.userInfo || {}
        const userOpenId = this.data.userOpenid

        db.collection('comments').add({
            data: {
                merchantId: this.data.merchantId,
                userOpenId: userOpenId,
                // 为了兼容性，仍然保存当前的用户昵称和头像
                userNickname: userInfo.nickname || '微信用户',
                userAvatarUrl: userInfo.avatarUrl || '/images/default-avatar.png',
                content: content,
                likes: 0,
                likedBy: [],
                timestamp: db.serverDate()
            }
        }).then(() => {
            wx.hideLoading()
            wx.showToast({
                title: '评论成功',
                icon: 'success'
            })
            this.setData({
                commentContent: ''
            })
            this.loadComments()
        }).catch(err => {
            console.error('提交评论失败', err)
            wx.hideLoading()
            wx.showToast({
                title: '评论失败',
                icon: 'none'
            })
        })
    },

    // 点赞/取消点赞评论
    likeComment: function (e) {
        if (!this.data.isLogin) {
            this.goToLogin()
            return
        }

        const commentId = e.currentTarget.dataset.id
        const commentIndex = this.data.comments.findIndex(c => c._id === commentId)

        if (commentIndex === -1) return

        const comment = this.data.comments[commentIndex]
        const isLiked = comment.isLiked

        // 防止重复点击
        if (comment.animating) return

        // 为当前评论添加动画标记
        const comments = [...this.data.comments]
        comments[commentIndex].animating = true

        this.setData({
            comments: comments
        })

        // 动画结束后移除动画标记
        setTimeout(() => {
            const updatedComments = [...this.data.comments]
            if (updatedComments[commentIndex]) {
                updatedComments[commentIndex].animating = false
                this.setData({
                    comments: updatedComments
                })
            }
        }, 500)

        if (isLiked) {
            // 取消点赞
            // 先获取当前评论数据
            db.collection('comments').doc(commentId).get().then(res => {
                const currentComment = res.data
                const likedBy = currentComment.likedBy || []

                // 移除当前用户的openid
                const newLikedBy = likedBy.filter(id => id !== this.data.userOpenid)

                // 更新点赞数据
                return db.collection('comments').doc(commentId).update({
                    data: {
                        likes: newLikedBy.length, // 直接设置为新的点赞数量
                        likedBy: newLikedBy
                    }
                })
            }).then(() => {
                // 更新本地数据
                const comments = this.data.comments
                comments[commentIndex].likes = Math.max(0, comments[commentIndex].likes - 1) // 确保点赞数不为负数
                comments[commentIndex].isLiked = false

                if (comments[commentIndex].likedBy) {
                    comments[commentIndex].likedBy = comments[commentIndex].likedBy.filter(id => id !== this.data.userOpenid)
                }

                // 重新排序
                comments.sort((a, b) => b.likes - a.likes)

                this.setData({
                    comments: comments
                })
            }).catch(err => {
                console.error('取消点赞失败', err)
                wx.showToast({
                    title: '操作失败',
                    icon: 'none'
                })
            })
        } else {
            // 添加点赞
            db.collection('comments').doc(commentId).update({
                data: {
                    likes: _.inc(1),
                    likedBy: _.push(this.data.userOpenid)
                }
            }).then(() => {
                // 更新本地数据
                const comments = this.data.comments
                comments[commentIndex].likes += 1
                comments[commentIndex].isLiked = true

                // 更新likedBy数组
                if (!comments[commentIndex].likedBy) {
                    comments[commentIndex].likedBy = [this.data.userOpenid]
                } else {
                    comments[commentIndex].likedBy.push(this.data.userOpenid)
                }

                // 重新排序
                comments.sort((a, b) => b.likes - a.likes)

                this.setData({
                    comments: comments
                })
            }).catch(err => {
                console.error('点赞失败', err)
                wx.showToast({
                    title: '操作失败',
                    icon: 'none'
                })
            })
        }
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

        if (isFavorite) {
            // 取消收藏 - 使用云函数清理所有收藏记录后再检查状态
            wx.cloud.callFunction({
                name: 'cleanAllDuplicates',
                success: () => {
                    // 清理完成后再删除收藏
                    db.collection('favorites')
                        .where({
                            merchantId: this.data.merchantId,
                            userOpenId: this.data.userOpenid
                        })
                        .get()
                        .then(res => {
                            if (res.data && res.data.length > 0) {
                                // 删除找到的收藏记录
                                return db.collection('favorites').doc(res.data[0]._id).remove()
                            }
                            return Promise.reject('未找到收藏记录')
                        })
                        .then(() => {
                            this.setData({ isFavorite: false })
                            wx.showToast({
                                title: '已取消收藏',
                                icon: 'success'
                            })
                        })
                        .catch(err => {
                            if (err === '未找到收藏记录') {
                                this.setData({ isFavorite: false })
                                return
                            }
                            console.error('取消收藏失败', err)
                            wx.showToast({
                                title: '操作失败',
                                icon: 'none'
                            })
                        })
                },
                fail: err => {
                    console.error('清理收藏记录失败:', err)
                    wx.showToast({
                        title: '操作失败',
                        icon: 'none'
                    })
                }
            })
        } else {
            // 添加收藏前先检查是否已经收藏过
            db.collection('favorites')
                .where({
                    merchantId: this.data.merchantId,
                    userOpenId: this.data.userOpenid
                })
                .get()
                .then(res => {
                    if (res.data && res.data.length > 0) {
                        // 已经收藏过，不重复添加
                        console.log('该商家已经收藏过了')
                        this.setData({ isFavorite: true })
                        wx.showToast({
                            title: '已收藏',
                            icon: 'success'
                        })
                        return Promise.reject('已收藏')
                    }

                    // 没有收藏记录，添加新收藏
                    return db.collection('favorites').add({
                        data: {
                            merchantId: this.data.merchantId,
                            userOpenId: this.data.userOpenid,
                            timestamp: db.serverDate()
                        }
                    })
                })
                .then(() => {
                    this.setData({ isFavorite: true })
                    wx.showToast({
                        title: '收藏成功',
                        icon: 'success'
                    })
                })
                .catch(err => {
                    if (err === '已收藏') return
                    console.error('收藏失败', err)
                    wx.showToast({
                        title: '操作失败',
                        icon: 'none'
                    })
                })
        }
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

    // 输入评论内容
    inputComment: function (e) {
        this.setData({
            commentContent: e.detail.value
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

    // 处理评论数据，添加点赞状态
    processComments: function (comments) {
        const userOpenid = this.data.userOpenid;

        return comments.map(comment => {
            // 添加用户点赞状态
            const isLiked = comment.likedBy && comment.likedBy.includes(userOpenid);

            // 获取用户信息
            let user = {
                nickname: comment.userNickname || '微信用户',
                avatarUrl: comment.userAvatarUrl || '/images/default-avatar.png'
            };

            // 如果评论中包含完整的用户信息，则使用它
            if (comment.user) {
                user = comment.user;
            }

            return {
                ...comment,
                isLiked: isLiked,
                user: user,
                animating: false
            };
        });
    }
}) 