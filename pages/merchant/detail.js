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
        if (options.id) {
            this.setData({
                merchantId: options.id
            })
            this.loadMerchantData()
            this.checkLoginStatus()
        } else {
            wx.showToast({
                title: '商家信息错误',
                icon: 'error'
            })
            setTimeout(() => {
                wx.navigateBack()
            }, 1500)
        }
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

    // 加载商家数据
    loadMerchantData: function () {
        this.setData({ loading: true })

        db.collection('merchants').doc(this.data.merchantId).get()
            .then(res => {
                const merchant = res.data

                // 加载平台数据
                this.setData({
                    merchant: merchant,
                    platforms: merchant.platforms || []
                })

                // 加载评分数据
                this.loadRatingData()

                // 加载评论数据
                this.loadComments()
            })
            .catch(err => {
                console.error('获取商家信息失败', err)
                this.setData({ loading: false })
                wx.stopPullDownRefresh()
                wx.showToast({
                    title: '获取商家信息失败',
                    icon: 'none'
                })
            })
    },

    // 加载评分数据
    loadRatingData: function () {
        db.collection('ratings')
            .where({
                merchantId: this.data.merchantId
            })
            .get()
            .then(res => {
                const ratings = res.data
                const ratingCount = ratings.length
                let avgRating = 0

                if (ratingCount > 0) {
                    const totalScore = ratings.reduce((sum, rating) => sum + rating.score, 0)
                    avgRating = (totalScore / ratingCount).toFixed(1)
                }

                // 生成评分星星数组
                const ratingStars = this.generateRatingStars(avgRating)

                this.setData({
                    'merchant.ratingCount': ratingCount,
                    'merchant.avgRating': avgRating,
                    ratingStars: ratingStars,
                    loading: false
                })

                wx.stopPullDownRefresh()
            })
            .catch(err => {
                console.error('获取评分信息失败', err)
                this.setData({ loading: false })
                wx.stopPullDownRefresh()
            })
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
        this.setData({ commentLoading: true })

        db.collection('comments')
            .where({
                merchantId: this.data.merchantId
            })
            .orderBy('likes', 'desc')
            .get()
            .then(res => {
                const comments = res.data

                if (comments.length === 0) {
                    this.setData({
                        comments: [],
                        commentLoading: false
                    });
                    return;
                }

                // 收集所有评论的用户openid
                const userOpenIds = [...new Set(comments.map(comment => comment.userOpenId))];

                // 批量获取用户信息
                const userPromises = userOpenIds.map(openid => {
                    return db.collection('users').doc(openid).get()
                        .then(userRes => {
                            return {
                                openid: openid,
                                userInfo: userRes.data
                            };
                        })
                        .catch(err => {
                            console.error(`获取用户 ${openid} 信息失败:`, err);
                            return {
                                openid: openid,
                                userInfo: {
                                    nickname: '用户',
                                    avatarUrl: '/images/default-avatar.png'
                                }
                            };
                        });
                });

                // 等待所有用户信息获取完成
                Promise.all(userPromises).then(usersData => {
                    // 将用户信息转换为以openid为键的对象，方便查找
                    const usersMap = {};
                    usersData.forEach(userData => {
                        usersMap[userData.openid] = userData.userInfo;
                    });

                    // 处理评论数据，关联最新的用户信息
                    const processedComments = comments.map(comment => {
                        // 获取该评论对应的最新用户信息
                        const userInfo = usersMap[comment.userOpenId] || {
                            nickname: comment.userNickname || '用户',
                            avatarUrl: comment.userAvatarUrl || '/images/default-avatar.png'
                        };

                        // 当前用户是否点赞过
                        const isLiked = comment.likedBy && comment.likedBy.includes(this.data.userOpenid);

                        return {
                            ...comment,
                            user: {
                                nickname: userInfo.nickname,
                                avatarUrl: userInfo.avatarUrl
                            },
                            isLiked: isLiked,
                            animating: false // 初始化动画状态
                        };
                    });

                    this.setData({
                        comments: processedComments,
                        commentLoading: false
                    });
                }).catch(err => {
                    console.error('处理用户信息失败:', err);

                    // 如果获取用户信息失败，使用评论中保存的用户信息
                    const fallbackComments = comments.map(comment => {
                        const user = {
                            nickname: comment.userNickname || '用户',
                            avatarUrl: comment.userAvatarUrl || '/images/default-avatar.png'
                        };

                        const isLiked = comment.likedBy && comment.likedBy.includes(this.data.userOpenid);

                        return {
                            ...comment,
                            user: user,
                            isLiked: isLiked,
                            animating: false // 初始化动画状态
                        };
                    });

                    this.setData({
                        comments: fallbackComments,
                        commentLoading: false
                    });
                });
            })
            .catch(err => {
                console.error('获取评论失败', err)
                this.setData({ commentLoading: false })
            })
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
    }
}) 