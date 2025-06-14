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
        ratingSubmitting: false
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

        if (isLogin) {
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

                this.setData({
                    'merchant.ratingCount': ratingCount,
                    'merchant.avgRating': avgRating,
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

                // 处理评论数据
                const processedComments = comments.map(comment => {
                    // 使用保存的用户信息，如果没有则使用默认值
                    const user = {
                        nickname: comment.userNickname || '用户',
                        avatarUrl: comment.userAvatarUrl || '/images/default-avatar.png'
                    };

                    // 对于旧数据，可能没有保存用户信息，需要兼容处理
                    if (!comment.userNickname && !comment.userAvatarUrl) {
                        // 这里可以选择查询用户集合，但为了性能考虑，直接使用默认值
                        // 后续新评论都会直接保存用户信息
                    }

                    // 当前用户是否点赞过
                    const isLiked = comment.likedBy && comment.likedBy.includes(this.data.userOpenid);

                    return {
                        ...comment,
                        user: user,
                        isLiked: isLiked
                    };
                });

                this.setData({
                    comments: processedComments,
                    commentLoading: false
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
                this.setData({
                    isFavorite: res.data && res.data.length > 0
                })
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

        db.collection('comments').add({
            data: {
                merchantId: this.data.merchantId,
                userOpenId: this.data.userOpenid,
                // 直接保存用户昵称和头像，避免每次查询
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

    // 点赞评论
    likeComment: function (e) {
        if (!this.data.isLogin) {
            this.goToLogin()
            return
        }

        const commentId = e.currentTarget.dataset.id
        const commentIndex = this.data.comments.findIndex(c => c._id === commentId)

        if (commentIndex === -1) return

        const comment = this.data.comments[commentIndex]

        // 检查是否已点赞
        if (comment.isLiked) {
            wx.showToast({
                title: '您已点赞过此评论',
                icon: 'none'
            })
            return
        }

        wx.showLoading({ title: '处理中...' })

        // 更新点赞数据
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

            // 重新排序
            comments.sort((a, b) => b.likes - a.likes)

            this.setData({
                comments: comments
            })

            wx.hideLoading()
            wx.showToast({
                title: '点赞成功',
                icon: 'success'
            })
        }).catch(err => {
            console.error('点赞失败', err)
            wx.hideLoading()
            wx.showToast({
                title: '点赞失败',
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

        const isFavorite = this.data.isFavorite

        wx.showLoading({ title: '处理中...' })

        if (isFavorite) {
            // 取消收藏
            db.collection('favorites')
                .where({
                    merchantId: this.data.merchantId,
                    userOpenId: this.data.userOpenid
                })
                .get()
                .then(res => {
                    if (res.data && res.data.length > 0) {
                        return db.collection('favorites').doc(res.data[0]._id).remove()
                    }
                    return Promise.reject('未找到收藏记录')
                })
                .then(() => {
                    this.setData({ isFavorite: false })
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
        } else {
            // 添加收藏
            db.collection('favorites').add({
                data: {
                    merchantId: this.data.merchantId,
                    userOpenId: this.data.userOpenid,
                    timestamp: db.serverDate()
                }
            }).then(() => {
                this.setData({ isFavorite: true })
                wx.hideLoading()
                wx.showToast({
                    title: '收藏成功',
                    icon: 'success'
                })
            }).catch(err => {
                console.error('收藏失败', err)
                wx.hideLoading()
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
        if (!appId) {
            wx.showToast({
                title: '无法跳转到该平台',
                icon: 'none'
            })
            return
        }

        wx.navigateToMiniProgram({
            appId: appId,
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
    }
}) 