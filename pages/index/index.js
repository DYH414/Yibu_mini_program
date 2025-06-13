// 首页 JS
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Page({
    data: {
        categories: [
            { id: 'all', name: '全部', icon: '/images/categories/all.png' },
            { id: 'fast-food', name: '快餐', icon: '/images/categories/fast-food.png' },
            { id: 'snack', name: '小吃', icon: '/images/categories/snack.png' },
            { id: 'burger', name: '汉堡', icon: '/images/categories/burger.png' },
            { id: 'milk-tea', name: '奶茶', icon: '/images/categories/milk-tea.png' },
            { id: 'delivery-platform', name: '外卖平台', icon: '/images/categories/delivery-platform.png' },
            { id: 'other', name: '其他', icon: '/images/categories/other.png' }
        ],
        currentCategory: 'all',
        merchants: [],
        loading: true,
        sortBy: 'default', // default 或 rating
    },

    onLoad: function (options) {
        this.loadMerchants()
    },

    onPullDownRefresh: function () {
        this.loadMerchants()
    },

    // 切换分类
    switchCategory: function (e) {
        const categoryId = e.currentTarget.dataset.id
        this.setData({
            currentCategory: categoryId,
            loading: true
        })
        this.loadMerchants()
    },

    // 切换排序方式
    switchSort: function (e) {
        const sortBy = e.currentTarget.dataset.sort
        this.setData({
            sortBy: sortBy,
            loading: true
        })
        this.loadMerchants()
    },

    // 加载商家数据
    loadMerchants: function () {
        let query = db.collection('merchants')

        // 根据分类筛选
        if (this.data.currentCategory !== 'all') {
            query = query.where({
                category: this.data.currentCategory
            })
        }

        // 根据排序方式确定排序字段
        let orderField = 'createTime'
        if (this.data.sortBy === 'rating') {
            orderField = 'avgRating'
        }

        query.orderBy(orderField, 'desc')
            .get()
            .then(res => {
                let merchants = res.data

                // 加载每个商家的评分信息
                const tasks = merchants.map(merchant => {
                    return db.collection('ratings')
                        .where({
                            merchantId: merchant._id
                        })
                        .get()
                        .then(ratingRes => {
                            const ratings = ratingRes.data
                            const ratingCount = ratings.length
                            let avgRating = 0

                            if (ratingCount > 0) {
                                const totalScore = ratings.reduce((sum, rating) => sum + rating.score, 0)
                                avgRating = (totalScore / ratingCount).toFixed(1)
                            }

                            merchant.ratingCount = ratingCount
                            merchant.avgRating = avgRating

                            return merchant
                        })
                })

                Promise.all(tasks).then(updatedMerchants => {
                    // 如果是按评分排序，再次排序
                    if (this.data.sortBy === 'rating') {
                        updatedMerchants.sort((a, b) => b.avgRating - a.avgRating)
                    }

                    this.setData({
                        merchants: updatedMerchants,
                        loading: false
                    })

                    wx.stopPullDownRefresh()
                })
            })
            .catch(err => {
                console.error('加载商家数据失败', err)
                this.setData({
                    loading: false
                })
                wx.stopPullDownRefresh()
            })
    },

    // 跳转到商家详情页
    goToMerchantDetail: function (e) {
        const merchantId = e.currentTarget.dataset.id
        wx.navigateTo({
            url: `/pages/merchant/detail?id=${merchantId}`
        })
    }
}) 