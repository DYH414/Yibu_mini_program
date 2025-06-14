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
        isRefreshing: false // 标记是否正在下拉刷新
    },

    onLoad: function (options) {
        this.loadMerchants()
    },

    /**
     * 下拉刷新处理函数
     * 当用户下拉页面时触发，重新加载商家数据
     */
    onPullDownRefresh: function () {
        console.log('触发下拉刷新')
        // 设置刷新状态
        this.setData({
            isRefreshing: true,
            loading: true
        })

        // 重新加载商家数据
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

    /**
     * 生成评分星星数组
     * @param {number} rating - 评分值(0-5)
     * @return {Array} 包含5个元素的数组，每个元素为'full', 'half', 或 'empty'
     */
    generateStarArray: function (rating) {
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

    /**
     * 加载商家数据
     * 从云数据库获取商家列表，并计算每个商家的平均评分
     * 支持按分类筛选和按评分/默认排序
     */
    loadMerchants: function () {
        console.log('加载商家数据，分类:', this.data.currentCategory, '排序:', this.data.sortBy)

        // 清空现有数据，避免下拉刷新时显示旧数据
        if (this.data.isRefreshing) {
            this.setData({
                merchants: []
            })
        }

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
                console.log('获取到商家数据:', merchants.length, '条')

                // 如果没有数据，直接更新状态并结束刷新
                if (merchants.length === 0) {
                    this.setData({
                        merchants: [],
                        loading: false,
                        isRefreshing: false
                    })

                    // 停止下拉刷新动画
                    wx.stopPullDownRefresh()
                    return
                }

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

                            // 生成星星数组
                            merchant.starArray = this.generateStarArray(avgRating)

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
                        loading: false,
                        isRefreshing: false
                    })

                    console.log('数据加载完成，停止下拉刷新')
                    // 停止下拉刷新动画
                    wx.stopPullDownRefresh()
                })
            })
            .catch(err => {
                console.error('加载商家数据失败', err)
                this.setData({
                    loading: false,
                    isRefreshing: false
                })

                // 显示错误提示
                wx.showToast({
                    title: '刷新失败',
                    icon: 'none'
                })

                // 停止下拉刷新动画
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