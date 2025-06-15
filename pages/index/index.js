// 首页 JS
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Page({
    data: {
        categories: [
            { id: 'all', name: '全部', icon: '/images/categories/all.png' },
            { id: 'fast-food', name: '正餐', icon: '/images/categories/fast-food.png' },
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
        isRefreshing: false, // 标记是否正在下拉刷新
        searchKeyword: '', // 搜索关键词
        searchFocus: false, // 搜索框是否聚焦
        isSearching: false, // 是否处于搜索状态
        originalMerchants: [], // 存储原始商家列表，用于搜索后恢复
        page: 1,
        pageSize: 10,
        hasMore: true,
        showSearchHistory: false // 是否显示搜索历史
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
            loading: true,
            page: 1,
            hasMore: true
        })

        // 重新加载商家数据
        if (this.data.isSearching && this.data.searchKeyword) {
            this.performCloudSearch(this.data.searchKeyword)
        } else {
            this.loadMerchants()
        }
    },

    /**
     * 页面上拉触底事件的处理函数
     * 用于加载更多数据
     */
    onReachBottom: function () {
        if (!this.data.hasMore || this.data.loading) {
            return
        }

        if (this.data.isSearching && this.data.searchKeyword) {
            this.loadMoreSearchResults()
        } else {
            this.loadMoreMerchants()
        }
    },

    // 切换分类
    switchCategory: function (e) {
        const categoryId = e.currentTarget.dataset.id
        this.setData({
            currentCategory: categoryId,
            loading: true,
            searchKeyword: '', // 切换分类时清空搜索关键词
            isSearching: false,  // 退出搜索状态
            page: 1,
            hasMore: true,
            showSearchHistory: false // 隐藏搜索历史
        })
        this.loadMerchants()
    },

    // 切换排序方式
    switchSort: function (e) {
        const sortBy = e.currentTarget.dataset.sort
        this.setData({
            sortBy: sortBy,
            loading: true,
            page: 1,
            hasMore: true,
            showSearchHistory: false // 隐藏搜索历史
        })

        if (this.data.isSearching && this.data.searchKeyword) {
            this.performCloudSearch(this.data.searchKeyword)
        } else {
            this.loadMerchants()
        }
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
        console.log('加载商家数据，分类:', this.data.currentCategory, '排序:', this.data.sortBy, '页码:', this.data.page)

        // 获取app实例
        const app = getApp();

        // 清空现有数据，避免下拉刷新时显示旧数据
        if (this.data.isRefreshing || this.data.page === 1) {
            this.setData({
                merchants: []
            })
        }

        // 构建缓存键
        const cacheKey = `merchants_${this.data.currentCategory}_${this.data.sortBy}_${this.data.page}`;

        // 尝试从缓存获取数据
        if (!this.data.isRefreshing && this.data.page === 1) {
            const cachedData = app.cache.get(cacheKey);
            if (cachedData) {
                console.log('使用缓存数据:', cacheKey);
                this.setData({
                    merchants: cachedData,
                    originalMerchants: cachedData,
                    loading: false,
                    isRefreshing: false,
                    hasMore: cachedData.length === this.data.pageSize
                });
                return;
            }
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

        // 分页查询
        query = query.orderBy(orderField, 'desc')
            .skip((this.data.page - 1) * this.data.pageSize)
            .limit(this.data.pageSize)

        query.get()
            .then(res => {
                let merchants = res.data
                console.log('获取到商家数据:', merchants.length, '条')

                // 如果没有数据，直接更新状态并结束刷新
                if (merchants.length === 0) {
                    this.setData({
                        loading: false,
                        isRefreshing: false,
                        hasMore: false
                    })

                    // 停止下拉刷新动画
                    wx.stopPullDownRefresh()
                    return
                }

                // 获取商家ID列表
                const merchantIds = merchants.map(merchant => merchant._id);

                // 批量获取评分数据
                this.batchGetRatings(merchantIds, merchants).then(updatedMerchants => {
                    // 如果是按评分排序，再次排序
                    if (this.data.sortBy === 'rating') {
                        updatedMerchants.sort((a, b) => b.avgRating - a.avgRating)
                    }

                    // 合并现有数据和新数据
                    const currentMerchants = this.data.page === 1 ? [] : this.data.merchants
                    const newMerchants = [...currentMerchants, ...updatedMerchants]

                    // 更新数据
                    this.setData({
                        merchants: newMerchants,
                        originalMerchants: newMerchants, // 保存原始数据用于搜索
                        loading: false,
                        isRefreshing: false,
                        hasMore: updatedMerchants.length === this.data.pageSize
                    })

                    // 如果是第一页，缓存结果
                    if (this.data.page === 1) {
                        app.cache.set(cacheKey, newMerchants);
                    }

                    console.log('数据加载完成，停止下拉刷新')
                    // 停止下拉刷新动画
                    wx.stopPullDownRefresh()
                }).catch(err => {
                    console.error('处理评分数据失败', err)
                    this.setData({
                        loading: false,
                        isRefreshing: false
                    })
                    wx.stopPullDownRefresh()
                });
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

    /**
     * 批量获取评分数据
     * @param {Array} merchantIds - 商家ID列表
     * @param {Array} merchants - 商家数据列表
     * @return {Promise} 更新后的商家数据
     */
    batchGetRatings: function (merchantIds, merchants) {
        // 获取app实例
        const app = getApp();

        // 尝试从缓存获取评分数据
        const cacheKey = `ratings_${merchantIds.join('_')}`;
        const cachedRatings = app.cache.get(cacheKey);

        if (cachedRatings) {
            console.log('使用缓存的评分数据');
            // 使用缓存的评分数据更新商家信息
            return Promise.resolve(merchants.map(merchant => {
                const merchantRatings = cachedRatings[merchant._id] || [];
                const ratingCount = merchantRatings.length;
                let avgRating = 0;

                if (ratingCount > 0) {
                    const totalScore = merchantRatings.reduce((sum, rating) => sum + rating.score, 0);
                    avgRating = (totalScore / ratingCount).toFixed(1);
                }

                merchant.ratingCount = ratingCount;
                merchant.avgRating = avgRating;
                merchant.starArray = this.generateStarArray(avgRating);

                return merchant;
            }));
        }

        // 缓存不存在，从数据库获取评分数据
        return db.collection('ratings')
            .where({
                merchantId: db.command.in(merchantIds)
            })
            .get()
            .then(res => {
                const ratings = res.data;

                // 按商家ID分组评分数据
                const ratingsByMerchant = {};
                ratings.forEach(rating => {
                    if (!ratingsByMerchant[rating.merchantId]) {
                        ratingsByMerchant[rating.merchantId] = [];
                    }
                    ratingsByMerchant[rating.merchantId].push(rating);
                });

                // 缓存评分数据
                app.cache.set(cacheKey, ratingsByMerchant, 10 * 60 * 1000); // 10分钟缓存

                // 更新商家信息
                return merchants.map(merchant => {
                    const merchantRatings = ratingsByMerchant[merchant._id] || [];
                    const ratingCount = merchantRatings.length;
                    let avgRating = 0;

                    if (ratingCount > 0) {
                        const totalScore = merchantRatings.reduce((sum, rating) => sum + rating.score, 0);
                        avgRating = (totalScore / ratingCount).toFixed(1);
                    }

                    merchant.ratingCount = ratingCount;
                    merchant.avgRating = avgRating;
                    merchant.starArray = this.generateStarArray(avgRating);

                    return merchant;
                });
            });
    },

    // 加载更多商家数据
    loadMoreMerchants: function () {
        if (!this.data.hasMore || this.data.loading) {
            return
        }

        this.setData({
            page: this.data.page + 1,
            loading: true
        })

        this.loadMerchants()
    },

    // 跳转到商家详情页
    goToMerchantDetail: function (e) {
        const merchantId = e.currentTarget.dataset.id
        wx.navigateTo({
            url: `/pages/merchant/detail?id=${merchantId}`
        })
    },

    // 搜索框获得焦点
    onSearchFocus: function () {
        // 显示搜索历史
        this.setData({
            showSearchHistory: true
        })
    },

    // 搜索框失去焦点
    onSearchBlur: function () {
        // 延迟隐藏搜索历史，以便用户可以点击历史记录
        setTimeout(() => {
            this.setData({
                showSearchHistory: false
            })
        }, 200)
    },

    // 搜索输入处理
    onSearchInput: function (e) {
        const keyword = e.detail.value
        this.setData({
            searchKeyword: keyword
        })

        // 实时搜索，当输入内容时立即过滤
        if (keyword) {
            // 本地搜索，对已加载的商家数据进行过滤
            this.performLocalSearch(keyword)
        } else {
            // 如果搜索框为空，恢复原始数据
            this.resetSearch()
        }
    },

    // 搜索确认处理（用户点击搜索按钮或按下回车键）
    onSearchConfirm: function (e) {
        const keyword = e.detail.value
        if (keyword) {
            // 使用云函数进行搜索
            this.performCloudSearch(keyword)
            // 隐藏搜索历史
            this.setData({
                showSearchHistory: false
            })
        }
    },

    // 清空搜索
    clearSearch: function () {
        this.setData({
            searchKeyword: '',
            searchFocus: true,
            page: 1,
            hasMore: true
        })
        this.resetSearch()
    },

    // 从搜索历史中选择关键词
    onHistorySelect: function (e) {
        const keyword = e.detail.keyword
        this.setData({
            searchKeyword: keyword,
            showSearchHistory: false
        })
        this.performCloudSearch(keyword)
    },

    // 执行本地搜索（实时过滤）
    performLocalSearch: function (keyword) {
        if (!this.data.originalMerchants.length) {
            return
        }

        this.setData({ isSearching: true, loading: true })

        // 本地搜索，对已加载的商家数据进行过滤
        setTimeout(() => {
            const filteredMerchants = this.data.originalMerchants.filter(merchant => {
                return merchant.name.toLowerCase().includes(keyword.toLowerCase()) ||
                    merchant.description.toLowerCase().includes(keyword.toLowerCase())
            })

            this.setData({
                merchants: filteredMerchants,
                loading: false
            })
        }, 300) // 添加短暂延迟，提供更好的用户体验
    },

    // 执行云函数搜索（更全面的搜索）
    performCloudSearch: function (keyword) {
        this.setData({
            isSearching: true,
            loading: true,
            page: 1,
            hasMore: true
        })

        // 显示加载提示
        wx.showLoading({
            title: '搜索中...',
        })

        // 调用云函数进行搜索
        wx.cloud.callFunction({
            name: 'search',
            data: {
                keyword: keyword,
                category: this.data.currentCategory,
                sortBy: this.data.sortBy,
                page: this.data.page,
                pageSize: this.data.pageSize
            }
        }).then(res => {
            wx.hideLoading()

            if (res.result && res.result.success) {
                const { merchants, total } = res.result.data

                // 为每个商家生成星星数组
                const updatedMerchants = merchants.map(merchant => {
                    merchant.starArray = this.generateStarArray(merchant.avgRating)
                    return merchant
                })

                this.setData({
                    merchants: updatedMerchants,
                    loading: false,
                    isRefreshing: false,
                    hasMore: merchants.length === this.data.pageSize &&
                        (this.data.page * this.data.pageSize) < total
                })

                // 显示搜索结果提示
                if (updatedMerchants.length === 0) {
                    wx.showToast({
                        title: '没有找到相关商家',
                        icon: 'none'
                    })
                }
            } else {
                this.handleSearchError()
            }

            // 停止下拉刷新动画
            wx.stopPullDownRefresh()
        }).catch(err => {
            console.error('搜索失败', err)
            this.handleSearchError()

            // 停止下拉刷新动画
            wx.stopPullDownRefresh()
        })
    },

    // 加载更多搜索结果
    loadMoreSearchResults: function () {
        if (!this.data.hasMore || this.data.loading || !this.data.searchKeyword) {
            return
        }

        this.setData({
            page: this.data.page + 1,
            loading: true
        })

        // 调用云函数加载更多搜索结果
        wx.cloud.callFunction({
            name: 'search',
            data: {
                keyword: this.data.searchKeyword,
                category: this.data.currentCategory,
                sortBy: this.data.sortBy,
                page: this.data.page,
                pageSize: this.data.pageSize
            }
        }).then(res => {
            if (res.result && res.result.success) {
                const { merchants, total } = res.result.data

                // 为每个商家生成星星数组
                const moreMerchants = merchants.map(merchant => {
                    merchant.starArray = this.generateStarArray(merchant.avgRating)
                    return merchant
                })

                // 合并现有数据和新数据
                const newMerchants = [...this.data.merchants, ...moreMerchants]

                this.setData({
                    merchants: newMerchants,
                    loading: false,
                    hasMore: moreMerchants.length === this.data.pageSize &&
                        (this.data.page * this.data.pageSize) < total
                })
            } else {
                this.handleSearchError()
            }
        }).catch(err => {
            console.error('加载更多搜索结果失败', err)
            this.handleSearchError()
        })
    },

    // 处理搜索错误
    handleSearchError: function () {
        this.setData({
            loading: false,
            isRefreshing: false
        })

        wx.hideLoading()
        wx.showToast({
            title: '搜索失败，请重试',
            icon: 'none'
        })
    },

    // 重置搜索，恢复原始数据
    resetSearch: function () {
        if (this.data.isSearching) {
            this.setData({
                merchants: this.data.originalMerchants,
                isSearching: false,
                page: 1,
                hasMore: true
            })

            // 重新加载数据
            this.loadMerchants()
        }
    }
}) 