import { userAgreement, privacyPolicy } from '../common/agreements.js'

Page({
    data: {
        title: '',
        content: ''
    },

    onLoad: function (options) {
        const type = options.type || 'userAgreement'

        if (type === 'userAgreement') {
            this.setData({
                title: '用户服务协议',
                content: userAgreement
            })
        } else if (type === 'privacyPolicy') {
            this.setData({
                title: '隐私政策',
                content: privacyPolicy
            })
        }
    },

    handleBack: function () {
        wx.navigateBack()
    }
}) 