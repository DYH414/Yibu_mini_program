Page({
    data: {
        loading: false,
        result: null
    },

    onLoad: function () {
        // 页面加载时的初始化
    },

    // 调用修复商家分类的云函数
    fixCategories: function () {
        this.setData({
            loading: true,
            result: null
        });

        wx.cloud.callFunction({
            name: 'fixMerchantCategory',
            success: res => {
                console.log('修复商家分类成功', res);
                this.setData({
                    result: res.result,
                    loading: false
                });
            },
            fail: err => {
                console.error('修复商家分类失败', err);
                wx.showToast({
                    title: '修复失败',
                    icon: 'none'
                });
                this.setData({
                    loading: false
                });
            }
        });
    }
}) 