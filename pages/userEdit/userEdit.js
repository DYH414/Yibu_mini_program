// 用户编辑页面 JS
const app = getApp()

Page({
    data: {
        userInfo: null,
        nickname: '',
        avatarUrl: '',
        isLoading: false
    },

    onLoad: function () {
        // 获取当前用户信息
        if (app.globalData.isLogin && app.globalData.userInfo) {
            const userInfo = app.globalData.userInfo
            console.log('用户编辑页获取用户信息:', userInfo)
            this.setData({
                userInfo: userInfo,
                nickname: userInfo.nickname || '微信用户',
                avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png'
            })
        } else {
            console.log('用户未登录或无用户信息')
            wx.showToast({
                title: '请先登录',
                icon: 'none',
                success: () => {
                    setTimeout(() => {
                        wx.navigateBack()
                    }, 1500)
                }
            })
        }
    },

    // 输入昵称
    onInputNickname: function (e) {
        this.setData({
            nickname: e.detail.value
        })
    },

    // 选择头像
    chooseAvatar: function () {
        wx.chooseImage({
            count: 1,
            sizeType: ['compressed'],
            sourceType: ['album', 'camera'],
            success: res => {
                const tempFilePath = res.tempFilePaths[0]
                this.uploadAvatar(tempFilePath)
            }
        })
    },

    // 上传头像到云存储
    uploadAvatar: function (filePath) {
        wx.showLoading({
            title: '上传中...'
        })

        const openid = app.globalData.openid
        const cloudPath = `user_avatars/${openid}_${new Date().getTime()}.${filePath.match(/\.(\w+)$/)[1]}`

        console.log('准备上传头像:', cloudPath)
        wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: filePath,
            success: res => {
                console.log('头像上传成功:', res.fileID)
                this.setData({
                    avatarUrl: res.fileID
                })
                wx.hideLoading()
                wx.showToast({
                    title: '上传成功'
                })
            },
            fail: err => {
                console.error('上传头像失败', err)
                wx.hideLoading()
                wx.showToast({
                    title: '上传失败',
                    icon: 'none'
                })
            }
        })
    },

    // 保存用户信息
    saveUserInfo: function () {
        if (!this.data.nickname.trim()) {
            wx.showToast({
                title: '昵称不能为空',
                icon: 'none'
            })
            return
        }

        this.setData({ isLoading: true })
        wx.showLoading({ title: '保存中...' })

        const db = wx.cloud.database()
        const openid = app.globalData.openid

        console.log('准备保存用户信息:', {
            nickname: this.data.nickname,
            avatarUrl: this.data.avatarUrl,
            openid: openid
        })

        // 使用update而不是set，并且不包含_id字段
        db.collection('users').doc(openid).update({
            data: {
                nickname: this.data.nickname,
                avatarUrl: this.data.avatarUrl,
                updateTime: db.serverDate()
            }
        }).then(() => {
            console.log('保存用户信息成功')

            // 更新全局用户信息
            app.globalData.userInfo = {
                _id: openid,
                nickname: this.data.nickname,
                avatarUrl: this.data.avatarUrl,
                updateTime: new Date()
            }

            console.log('更新后的全局用户信息:', app.globalData.userInfo)

            // 等待一段时间确保数据库更新完成
            setTimeout(() => {
                wx.hideLoading()
                wx.showToast({
                    title: '保存成功',
                    success: () => {
                        setTimeout(() => {
                            wx.navigateBack()
                        }, 1000)
                    }
                })
            }, 1000)
        }).catch(err => {
            console.error('保存用户信息失败', err)
            wx.hideLoading()
            wx.showToast({
                title: '保存失败',
                icon: 'none'
            })
            this.setData({ isLoading: false })
        })
    }
}) 