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
        sortBy: 'default', // default、rating 或 clicks
        isRefreshing: false, // 标记是否正在下拉刷新
        searchKeyword: '', // 搜索关键词
        searchFocus: false, // 搜索框是否聚焦
        isSearching: false, // 是否处于搜索状态
        originalMerchants: [], // 存储原始商家列表，用于搜索后恢复
        page: 1,
        pageSize: 10,
        hasMore: true,
        showSearchHistory: false, // 是否显示搜索历史
        scrollPosition: 0, // 保存滚动位置
        isLoadingMore: false, // 是否正在加载更多数据
        totalPages: 1,
        total: 0,
        announcements: [], // 公告列表
        currentAnnouncementIndex: 0, // 当前显示的公告索引
        showAnnouncement: true // 是否显示公告
    },

    onLoad: function (options) {
        // 清除缓存，确保使用最新排序逻辑
        this.clearMerchantCache()
        this.loadAnnouncements()
        this.loadMerchants()

        // 监听缓存事件，当商家数据更新时刷新列表
        this.setupCacheEventListeners()
    },

    onUnload: function () {
        // 页面卸载时移除事件监听
        const app = getApp()
        if (app.cacheEvents && app.cacheEvents.listeners) {
            // 移除事件监听器的引用
            app.cacheEvents.listeners['merchantDataUpdated'] =
                app.cacheEvents.listeners['merchantDataUpdated']?.filter(
                    listener => listener !== this.onMerchantDataUpdated
                )

            app.cacheEvents.listeners['cacheInvalidated'] =
                app.cacheEvents.listeners['cacheInvalidated']?.filter(
                    listener => listener !== this.onCacheInvalidated
                )
        }
    },

    // 加载公告数据
    loadAnnouncements: function () {
        console.log('开始加载公告数据...')
        wx.cloud.callFunction({
            name: 'getAnnouncements',
            data: {
                limit: 5,
                isActive: true
            }
        }).then(res => {
            console.log('云函数调用成功，响应:', res)
            if (res.result && res.result.success) {
                console.log('获取到公告数据:', res.result.data)
                this.setData({
                    announcements: res.result.data
                })

                // 如果有公告，启动自动切换
                if (res.result.data.length > 1) {
                    this.startAnnouncementTimer()
                    console.log('启动公告自动切换定时器')
                }

                if (res.result.data.length === 0) {
                    console.log('数据库中没有有效的公告数据')
                }
            } else {
                console.error('云函数返回失败:', res.result)
            }
        }).catch(err => {
            console.error('加载公告失败:', err)
        })
    },



    // 启动公告自动切换定时器
    startAnnouncementTimer: function () {
        if (this.announcementTimer) {
            clearInterval(this.announcementTimer)
        }

        this.announcementTimer = setInterval(() => {
            if (this.data.announcements.length > 1) {
                const nextIndex = (this.data.currentAnnouncementIndex + 1) % this.data.announcements.length
                this.setData({
                    currentAnnouncementIndex: nextIndex
                })
            }
        }, 3000) // 每3秒切换一次
    },

    // 点击公告处理
    onAnnouncementTap: function (e) {
        const announcement = this.data.announcements[this.data.currentAnnouncementIndex]
        if (!announcement) return

        // 更新浏览量
        wx.cloud.callFunction({
            name: 'updateAnnouncementView',
            data: {
                announcementId: announcement._id
            }
        })

        // 如果有链接，跳转到链接
        if (announcement.linkUrl) {
            if (announcement.linkUrl.startsWith('http')) {
                // 外部链接
                wx.copyData({
                    data: announcement.linkUrl,
                    success: () => {
                        wx.showToast({
                            title: '链接已复制',
                            icon: 'success'
                        })
                    }
                })
            } else {
                // 内部页面链接
                wx.navigateTo({
                    url: announcement.linkUrl
                })
            }
        } else {
            // 显示公告详情
            wx.showModal({
                title: announcement.title,
                content: announcement.content,
                showCancel: false,
                confirmText: '知道了'
            })
        }
    },

    // 关闭公告
    closeAnnouncement: function () {
        this.setData({
            showAnnouncement: false
        })

        if (this.announcementTimer) {
            clearInterval(this.announcementTimer)
        }
    },

    /**
     * 清除商家数据相关的缓存
     * 在修改排序逻辑后调用，确保使用最新的排序结果
     */
    clearMerchantCache: function () {
        // 获取app实例
        const app = getApp();

        // 遍历并清除所有商家相关缓存
        for (const key in app.cache.data) {
            if (key.startsWith('merchants_') ||
                key.startsWith('ratings_') ||
                key.startsWith('comments_count_') ||
                key.startsWith('favorites_count_')) {
                app.cache.remove(key);
                console.log('已清除缓存:', key);
            }
        }

        // 清除云端缓存
        wx.cloud.callFunction({
            name: 'clearDataCache',
            data: {
                prefix: 'merchants_'
            }
        }).then(res => {
            console.log('清除云端缓存成功:', res.result)
        }).catch(err => {
            console.error('清除云端缓存失败:', err)
        })
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
            hasMore: true,
            isLoadingMore: false
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
        if (!this.data.hasMore || this.data.loading || this.data.isLoadingMore) {
            return
        }

        // 保存当前滚动位置
        this.saveScrollPosition()

        if (this.data.isSearching && this.data.searchKeyword) {
            this.loadMoreSearchResults()
        } else {
            this.loadMoreMerchants()
        }
    },

    // 保存页面滚动位置
    saveScrollPosition: function () {
        wx.createSelectorQuery()
            .selectViewport()
            .scrollOffset(res => {
                this.setData({
                    scrollPosition: res.scrollTop
                })
                console.log('保存滚动位置:', res.scrollTop)
            })
            .exec()
    },

    // 恢复页面滚动位置
    restoreScrollPosition: function () {
        if (this.data.scrollPosition > 0 && this.data.page > 1) {
            setTimeout(() => {
                wx.pageScrollTo({
                    scrollTop: this.data.scrollPosition,
                    duration: 0
                })
                console.log('恢复滚动位置:', this.data.scrollPosition)
            }, 100)
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
            showSearchHistory: false, // 隐藏搜索历史
            scrollPosition: 0, // 重置滚动位置
            isLoadingMore: false // 重置加载更多状态
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
            showSearchHistory: false, // 隐藏搜索历史
            scrollPosition: 0, // 重置滚动位置
            isLoadingMore: false // 重置加载更多状态
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
        const cacheKey = `merchants_${this.data.currentCategory}_${this.data.sortBy}_${this.data.page}_v4`;

        // 尝试从缓存获取数据
        if (!this.data.isRefreshing && this.data.page === 1) {
            const cachedData = app.cache.get(cacheKey);
            if (cachedData) {
                console.log('使用本地缓存数据:', cacheKey);
                this.setData({
                    merchants: cachedData.merchants,
                    originalMerchants: cachedData.merchants,
                    loading: false,
                    isRefreshing: false,
                    isLoadingMore: false,
                    hasMore: cachedData.hasMore,
                    totalPages: cachedData.totalPages || 1,
                    total: cachedData.total || 0
                });
                return;
            }
        }

        // 使用优化后的云函数获取商家数据，支持分页
        wx.cloud.callFunction({
            name: 'getAllMerchants',
            data: {
                category: this.data.currentCategory,
                sortBy: this.data.sortBy,
                page: this.data.page,
                pageSize: this.data.pageSize,
                useCache: true // 使用云端缓存
            }
        }).then(res => {
            if (res.result && res.result.success) {
                const data = res.result.data;
                const merchants = data.merchants || [];
                console.log('获取到商家数据:', merchants.length, '条，总数:', data.total, '页码:', data.page, '总页数:', data.totalPages);

                // 如果没有数据，直接更新状态并结束刷新
                if (merchants.length === 0) {
                    this.setData({
                        loading: false,
                        isRefreshing: false,
                        isLoadingMore: false,
                        hasMore: false,
                        totalPages: data.totalPages || 1,
                        total: data.total || 0
                    });
                    wx.stopPullDownRefresh();
                    return;
                }

                // 为每个商家生成星星数组
                merchants.forEach(merchant => {
                    merchant.starArray = this.generateStarArray(merchant.avgRating);
                });

                // 合并现有数据和新数据
                const currentMerchants = this.data.page === 1 ? [] : this.data.merchants;
                const newMerchants = [...currentMerchants, ...merchants];

                // 计算是否还有更多数据
                const hasMore = data.page < data.totalPages;

                // 更新数据
                this.setData({
                    merchants: newMerchants,
                    originalMerchants: newMerchants,
                    loading: false,
                    isRefreshing: false,
                    isLoadingMore: false,
                    hasMore: hasMore,
                    totalPages: data.totalPages || 1,
                    total: data.total || 0
                });

                // 如果是第一页，缓存结果
                if (this.data.page === 1) {
                    app.cache.set(cacheKey, {
                        merchants: newMerchants,
                        hasMore: hasMore,
                        totalPages: data.totalPages || 1,
                        total: data.total || 0
                    }, 5 * 60 * 1000, 'merchants');
                }

                // 如果是加载更多，恢复滚动位置
                if (this.data.page > 1) {
                    this.restoreScrollPosition();
                }

                console.log('数据加载完成，停止下拉刷新');
                wx.stopPullDownRefresh();
            } else {
                console.error('获取商家数据失败:', res.result);
                this.setData({
                    loading: false,
                    isRefreshing: false,
                    isLoadingMore: false
                });
                wx.stopPullDownRefresh();

                // 如果云函数调用失败，回退到原来的分页加载方式
                this.loadMerchantsWithPagination();
            }
        }).catch(err => {
            console.error('调用云函数失败:', err);
            this.setData({
                loading: false,
                isRefreshing: false,
                isLoadingMore: false
            });
            wx.stopPullDownRefresh();

            // 如果云函数调用失败，回退到原来的分页加载方式
            this.loadMerchantsWithPagination();
        });
    },

    /**
     * 使用分页方式加载商家数据（备用方法）
     * 仅在云函数调用失败时使用
     */
    loadMerchantsWithPagination: function () {
        console.log('回退到分页加载方式');

        let query = db.collection('merchants');

        // 根据分类筛选
        if (this.data.currentCategory !== 'all') {
            query = query.where({
                category: this.data.currentCategory
            });
        }

        // 始终按createTime排序获取原始数据
        query = query.orderBy('createTime', 'desc')
            .skip((this.data.page - 1) * this.data.pageSize)
            .limit(this.data.pageSize);

        query.get()
            .then(res => {
                let merchants = res.data;
                console.log('获取到商家数据:', merchants.length, '条');

                // 如果没有数据，直接更新状态并结束刷新
                if (merchants.length === 0) {
                    this.setData({
                        loading: false,
                        isRefreshing: false,
                        isLoadingMore: false,
                        hasMore: false
                    });
                    wx.stopPullDownRefresh();
                    return;
                }

                // 获取商家ID列表
                const merchantIds = merchants.map(merchant => merchant._id);

                // 批量获取评分数据
                this.batchGetRatings(merchantIds, merchants).then(updatedMerchants => {
                    // 批量获取评论数据
                    return this.batchGetComments(merchantIds, updatedMerchants);
                }).then(updatedMerchants => {
                    // 批量获取收藏数据
                    return this.batchGetFavorites(merchantIds, updatedMerchants);
                }).then(updatedMerchants => {
                    // 批量获取点击量数据
                    return this.batchGetClicks(merchantIds, updatedMerchants);
                }).then(updatedMerchants => {
                    // 根据排序方式进行排序
                    if (this.data.sortBy === 'rating') {
                        // 添加调试信息
                        console.log('排序前商家数据:', updatedMerchants.map(m => ({
                            name: m.name,
                            avgRating: m.avgRating,
                            ratingCount: m.ratingCount
                        })));

                        // 确保将avgRating转换为数字后再排序
                        updatedMerchants.forEach(merchant => {
                            merchant.avgRating = parseFloat(merchant.avgRating || 0);
                        });

                        // 按评分排序 - 使用明确的降序排序
                        updatedMerchants.sort((a, b) => {
                            // 主要按评分排序（降序）
                            if (a.avgRating !== b.avgRating) {
                                return b.avgRating - a.avgRating;
                            }

                            // 评分相同时，按评分数量排序（降序）
                            return (b.ratingCount || 0) - (a.ratingCount || 0);
                        });

                        // 添加调试信息
                        console.log('排序后商家数据:', updatedMerchants.map(m => ({
                            name: m.name,
                            avgRating: m.avgRating,
                            ratingCount: m.ratingCount
                        })));
                    } else if (this.data.sortBy === 'clicks') {
                        // 按点击量排序 - 使用明确的降序排序
                        console.log('排序前商家数据(热度):', updatedMerchants.map(m => ({
                            name: m.name,
                            totalClicks: m.totalClicks
                        })));

                        // 确保将totalClicks转换为数字后再排序
                        updatedMerchants.forEach(merchant => {
                            merchant.totalClicks = parseInt(merchant.totalClicks || 0);
                        });

                        // 按点击量排序（降序）
                        updatedMerchants.sort((a, b) => {
                            return (b.totalClicks || 0) - (a.totalClicks || 0);
                        });

                        // 添加调试信息
                        console.log('排序后商家数据(热度):', updatedMerchants.map(m => ({
                            name: m.name,
                            totalClicks: m.totalClicks
                        })));
                    } else if (this.data.sortBy === 'default') {
                        // 默认排序 - 使用综合排序算法
                        updatedMerchants.sort((a, b) => {
                            // 计算综合分数
                            const scoreA = this.calculateCompositeScore(a);
                            const scoreB = this.calculateCompositeScore(b);

                            // 按综合分数降序排序
                            return scoreB - scoreA;
                        });
                    }

                    // 合并现有数据和新数据
                    const currentMerchants = this.data.page === 1 ? [] : this.data.merchants;
                    const newMerchants = [...currentMerchants, ...updatedMerchants];

                    // 更新数据
                    this.setData({
                        merchants: newMerchants,
                        originalMerchants: newMerchants, // 保存原始数据用于搜索
                        loading: false,
                        isRefreshing: false,
                        isLoadingMore: false,
                        hasMore: updatedMerchants.length === this.data.pageSize
                    });

                    // 如果是第一页，缓存结果
                    if (this.data.page === 1) {
                        app.cache.set(cacheKey, newMerchants);
                    }

                    // 如果是加载更多，恢复滚动位置
                    if (this.data.page > 1) {
                        this.restoreScrollPosition();
                    }

                    console.log('数据加载完成，停止下拉刷新');
                    wx.stopPullDownRefresh();
                }).catch(err => {
                    console.error('处理商家数据失败', err);
                    this.setData({
                        loading: false,
                        isRefreshing: false,
                        isLoadingMore: false
                    });
                    wx.stopPullDownRefresh();
                });
            })
            .catch(err => {
                console.error('获取商家列表失败', err);
                this.setData({
                    loading: false,
                    isRefreshing: false,
                    isLoadingMore: false
                });
                wx.stopPullDownRefresh();
            });
    },

    /**
     * 计算商家的综合分数
     * 综合评分、评论数和收藏数
     */
    calculateCompositeScore: function (merchant) {
        // 获取评分、评论数和收藏数
        const avgRating = parseFloat(merchant.avgRating || 0);
        const commentsCount = merchant.commentsCount || 0;
        const favoritesCount = merchant.favoritesCount || 0;

        // 计算综合分数: 评分占50%，评论数占30%，收藏数占20%
        const score = avgRating * 0.5 +
            (Math.log(commentsCount + 1) * 0.3) +
            (Math.log(favoritesCount + 1) * 0.2);

        // 如果是推荐商家，增加权重
        if (merchant.isFeatured) {
            return score * 1.2;
        }

        return score;
    },

    /**
     * 批量获取商家评分数据
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
                    // 确保avgRating是数字而不是字符串
                    avgRating = parseFloat((totalScore / ratingCount).toFixed(1));
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
                        // 确保avgRating是数字而不是字符串
                        avgRating = parseFloat((totalScore / ratingCount).toFixed(1));
                    }

                    merchant.ratingCount = ratingCount;
                    merchant.avgRating = avgRating;
                    merchant.starArray = this.generateStarArray(avgRating);

                    return merchant;
                });
            });
    },

    /**
     * 批量获取商家评论数据
     */
    batchGetComments: function (merchantIds, merchants) {
        // 获取app实例
        const app = getApp();

        // 尝试从缓存获取评论数据
        const cacheKey = `comments_count_${merchantIds.join('_')}`;
        const cachedCommentsCount = app.cache.get(cacheKey);

        if (cachedCommentsCount) {
            console.log('使用缓存的评论数量数据');
            // 使用缓存的评论数量更新商家信息
            return Promise.resolve(merchants.map(merchant => {
                merchant.commentsCount = cachedCommentsCount[merchant._id] || 0;
                return merchant;
            }));
        }

        // 缓存不存在，从数据库获取评论数据
        return db.collection('comments')
            .where({
                merchantId: db.command.in(merchantIds)
            })
            .get()
            .then(res => {
                const comments = res.data;

                // 按商家ID分组评论数据
                const commentsByMerchant = {};
                comments.forEach(comment => {
                    if (!commentsByMerchant[comment.merchantId]) {
                        commentsByMerchant[comment.merchantId] = 0;
                    }
                    commentsByMerchant[comment.merchantId]++;
                });

                // 缓存评论数量数据
                app.cache.set(cacheKey, commentsByMerchant, 10 * 60 * 1000); // 10分钟缓存

                // 更新商家信息
                return merchants.map(merchant => {
                    merchant.commentsCount = commentsByMerchant[merchant._id] || 0;
                    return merchant;
                });
            });
    },

    /**
     * 批量获取商家收藏数据
     */
    batchGetFavorites: function (merchantIds, merchants) {
        // 获取app实例
        const app = getApp();

        // 尝试从缓存获取收藏数据
        const cacheKey = `favorites_count_${merchantIds.join('_')}`;
        const cachedFavoritesCount = app.cache.get(cacheKey);

        if (cachedFavoritesCount) {
            console.log('使用缓存的收藏数量数据');
            // 使用缓存的收藏数量更新商家信息
            return Promise.resolve(merchants.map(merchant => {
                merchant.favoritesCount = cachedFavoritesCount[merchant._id] || 0;
                return merchant;
            }));
        }

        // 缓存不存在，从数据库获取收藏数据
        return db.collection('favorites')
            .where({
                merchantId: db.command.in(merchantIds)
            })
            .get()
            .then(res => {
                const favorites = res.data;

                // 按商家ID分组收藏数据
                const favoritesByMerchant = {};
                favorites.forEach(favorite => {
                    if (!favoritesByMerchant[favorite.merchantId]) {
                        favoritesByMerchant[favorite.merchantId] = 0;
                    }
                    favoritesByMerchant[favorite.merchantId]++;
                });

                // 缓存收藏数量数据
                app.cache.set(cacheKey, favoritesByMerchant, 10 * 60 * 1000); // 10分钟缓存

                // 更新商家信息
                return merchants.map(merchant => {
                    merchant.favoritesCount = favoritesByMerchant[merchant._id] || 0;
                    return merchant;
                });
            });
    },

    /**
     * 批量获取商家点击量数据
     */
    batchGetClicks: function (merchantIds, merchants) {
        // 获取app实例
        const app = getApp();

        // 尝试从缓存获取点击量数据
        const cacheKey = `clicks_count_${merchantIds.join('_')}`;
        const cachedClicksCount = app.cache.get(cacheKey);

        if (cachedClicksCount) {
            console.log('使用缓存的点击量数据');
            // 使用缓存的点击量更新商家信息
            return Promise.resolve(merchants.map(merchant => {
                merchant.totalClicks = cachedClicksCount[merchant._id] || 0;
                return merchant;
            }));
        }

        // 缓存不存在，从数据库获取点击量数据
        // 使用云函数获取点击量数据
        return wx.cloud.callFunction({
            name: 'getMerchantClicks',
            data: {
                merchantIds: merchantIds
            }
        }).then(res => {
            if (res.result && res.result.success) {
                const clicksData = res.result.data || [];

                // 按商家ID分组点击量数据
                const clicksByMerchant = {};
                clicksData.forEach(click => {
                    clicksByMerchant[click.merchantId] = click.totalClicks || 0;
                });

                // 缓存点击量数据
                app.cache.set(cacheKey, clicksByMerchant, 10 * 60 * 1000); // 10分钟缓存

                // 更新商家信息
                return merchants.map(merchant => {
                    merchant.totalClicks = clicksByMerchant[merchant._id] || 0;
                    return merchant;
                });
            }

            // 如果云函数调用失败，回退到直接查询
            return db.collection('merchantClicks')
                .where({
                    merchantId: db.command.in(merchantIds)
                })
                .get()
                .then(res => {
                    const clicks = res.data;

                    // 按商家ID分组点击量数据
                    const clicksByMerchant = {};
                    clicks.forEach(click => {
                        clicksByMerchant[click.merchantId] = click.totalClicks || 0;
                    });

                    // 缓存点击量数据
                    app.cache.set(cacheKey, clicksByMerchant, 10 * 60 * 1000); // 10分钟缓存

                    // 更新商家信息
                    return merchants.map(merchant => {
                        merchant.totalClicks = clicksByMerchant[merchant._id] || 0;
                        return merchant;
                    });
                });
        }).catch(err => {
            console.error('获取点击量数据失败', err);
            // 如果出错，返回原始商家数据
            return Promise.resolve(merchants);
        });
    },

    // 加载更多商家数据
    loadMoreMerchants: function () {
        console.log('加载更多商家数据')
        this.setData({
            page: this.data.page + 1,
            isLoadingMore: true
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

    // 清除搜索
    clearSearch: function () {
        this.setData({
            searchKeyword: '',
            searchFocus: true,
            page: 1,
            hasMore: true
        })
        this.resetSearch()
    },

    // 强制刷新数据
    forceRefresh: function () {
        // 先清除缓存
        this.clearMerchantCache();

        // 显示加载提示
        wx.showLoading({
            title: '刷新数据中...',
        });

        // 设置刷新状态
        this.setData({
            loading: true,
            page: 1,
            hasMore: true,
            isRefreshing: true,
            isLoadingMore: false
        });

        // 重新加载数据
        this.loadMerchants();

        // 2秒后隐藏加载提示
        setTimeout(() => {
            wx.hideLoading();

            // 提示刷新成功
            wx.showToast({
                title: '刷新成功',
                icon: 'success'
            });
        }, 2000);
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

                // 只有在第一页且没有结果时才提示
                if (updatedMerchants.length === 0 && this.data.page === 1) {
                    wx.showToast({
                        title: '没有找到相关商家',
                        icon: 'none'
                    })
                }
            } else {
                // 即使云函数返回 success: false，也可能是因为没有结果，而不是真正的错误
                // 除非有明确的错误信息，否则不提示"搜索失败"
                console.warn('云函数搜索未成功:', res.result);
                // 当没有结果时，云函数可能返回 success: false，此时应该清空列表
                if (res.result && res.result.data && res.result.data.merchants.length === 0) {
                    this.setData({
                        merchants: [],
                        loading: false,
                        isRefreshing: false,
                        hasMore: false
                    });
                    wx.showToast({
                        title: '没有找到相关商家',
                        icon: 'none'
                    });
                } else {
                    // 显示错误提示
                    wx.showToast({
                        title: '搜索失败，请重试',
                        icon: 'none'
                    });
                    this.setData({
                        loading: false,
                        isRefreshing: false,
                        hasMore: false
                    });
                }
            }
        }).catch(err => {
            console.error('搜索失败:', err)
            wx.hideLoading()
            wx.showToast({
                title: '搜索失败，请重试',
                icon: 'none'
            })
            this.setData({
                loading: false,
                isRefreshing: false,
                hasMore: false
            })
        })
    },

    // 加载更多搜索结果
    loadMoreSearchResults: function () {
        if (!this.data.hasMore || !this.data.searchKeyword || this.data.isLoadingMore) {
            return
        }

        this.setData({
            page: this.data.page + 1,
            isLoadingMore: true
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
                    isLoadingMore: false,
                    hasMore: moreMerchants.length === this.data.pageSize &&
                        (this.data.page * this.data.pageSize) < total
                })

                // 恢复滚动位置
                this.restoreScrollPosition();
            } else {
                // 加载更多时，如果云函数返回非成功，一般意味着没有更多数据
                console.warn('加载更多搜索结果未成功:', res.result);
                this.setData({
                    isLoadingMore: false,
                    hasMore: false
                });
            }
        }).catch(err => {
            console.error('加载更多搜索结果失败', err)
            this.setData({
                isLoadingMore: false
            })
            this.handleSearchError() // 只有在真实网络错误时才提示
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
    },

    // 设置缓存事件监听
    setupCacheEventListeners: function () {
        const app = getApp()
        if (app.cacheEvents) {
            // 商家数据更新事件
            this.onMerchantDataUpdated = (data) => {
                console.log('收到商家数据更新事件:', data)
                // 如果当前不在刷新状态，且不是加载更多状态，则刷新数据
                if (!this.data.isRefreshing && !this.data.isLoadingMore) {
                    this.setData({
                        page: 1,
                        isRefreshing: true
                    })
                    this.loadMerchants()
                }
            }

            // 缓存失效事件
            this.onCacheInvalidated = (data) => {
                console.log('收到缓存失效事件:', data)
                // 如果是merchants_前缀的缓存被失效，刷新商家列表
                if (data.prefix && data.prefix.startsWith('merchants_')) {
                    // 如果当前不在刷新状态，且不是加载更多状态，则刷新数据
                    if (!this.data.isRefreshing && !this.data.isLoadingMore) {
                        this.setData({
                            page: 1,
                            isRefreshing: true
                        })
                        this.loadMerchants()
                    }
                }
            }

            // 注册事件监听
            app.cacheEvents.on('merchantDataUpdated', this.onMerchantDataUpdated)
            app.cacheEvents.on('cacheInvalidated', this.onCacheInvalidated)
        }
    }
}) 