// 搜索历史组件
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Component({
    /**
     * 组件的属性列表
     */
    properties: {
        visible: {
            type: Boolean,
            value: false
        },
        maxItems: {
            type: Number,
            value: 10
        }
    },

    /**
     * 组件的初始数据
     */
    data: {
        historyItems: [],
        loading: false
    },

    /**
     * 组件的方法列表
     */
    methods: {
        // 加载搜索历史
        loadHistory: function () {
            // 检查用户是否登录
            const userInfo = app.globalData.userInfo
            if (!userInfo || !userInfo.openid) {
                return
            }

            this.setData({ loading: true })

            db.collection('search_logs')
                .where({
                    userOpenId: userInfo.openid
                })
                .orderBy('timestamp', 'desc')
                .limit(this.properties.maxItems)
                .get()
                .then(res => {
                    // 去重处理
                    const uniqueKeywords = []
                    const uniqueItems = []

                    res.data.forEach(item => {
                        if (!uniqueKeywords.includes(item.keyword)) {
                            uniqueKeywords.push(item.keyword)
                            uniqueItems.push(item)
                        }
                    })

                    this.setData({
                        historyItems: uniqueItems,
                        loading: false
                    })
                })
                .catch(err => {
                    console.error('加载搜索历史失败', err)
                    this.setData({ loading: false })
                })
        },

        // 点击搜索历史项
        onHistoryItemTap: function (e) {
            const keyword = e.currentTarget.dataset.keyword
            this.triggerEvent('select', { keyword })
        },

        // 清除单个搜索历史
        onClearItem: function (e) {
            const id = e.currentTarget.dataset.id
            const keyword = e.currentTarget.dataset.keyword

            // 阻止事件冒泡
            e.stopPropagation()

            // 从界面上移除
            const newHistory = this.data.historyItems.filter(item => item._id !== id)
            this.setData({
                historyItems: newHistory
            })

            // 从数据库中删除
            db.collection('search_logs')
                .doc(id)
                .remove()
                .catch(err => {
                    console.error('删除搜索历史失败', err)
                })
        },

        // 清空所有搜索历史
        clearAllHistory: function () {
            const userInfo = app.globalData.userInfo
            if (!userInfo || !userInfo.openid) {
                return
            }

            wx.showModal({
                title: '提示',
                content: '确定要清空所有搜索历史吗？',
                success: res => {
                    if (res.confirm) {
                        // 清空界面显示
                        this.setData({
                            historyItems: []
                        })

                        // 调用云函数批量删除
                        wx.cloud.callFunction({
                            name: 'clearSearchHistory',
                            data: {
                                userOpenId: userInfo.openid
                            }
                        }).catch(err => {
                            console.error('清空搜索历史失败', err)
                        })
                    }
                }
            })
        }
    },

    // 组件生命周期
    lifetimes: {
        attached: function () {
            // 组件被添加到页面时执行
            if (this.properties.visible) {
                this.loadHistory()
            }
        }
    },

    // 监听属性变化
    observers: {
        'visible': function (visible) {
            if (visible) {
                this.loadHistory()
            }
        }
    }
}) 