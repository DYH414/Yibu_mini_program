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
            sizeType: ['compressed'], // 使用压缩图片
            sourceType: ['album', 'camera'],
            success: res => {
                const tempFilePath = res.tempFilePaths[0]

                // 获取图片信息
                wx.getImageInfo({
                    src: tempFilePath,
                    success: imageInfo => {
                        console.log('选择的图片信息:', imageInfo)

                        // 如果图片尺寸过大，先进行压缩处理
                        if (imageInfo.width > 300 || imageInfo.height > 300) {
                            // 使用canvas压缩图片
                            this.compressImage(tempFilePath, imageInfo)
                        } else {
                            // 直接上传小尺寸图片
                            this.uploadAvatar(tempFilePath)
                        }
                    },
                    fail: err => {
                        console.error('获取图片信息失败:', err)
                        // 获取图片信息失败，直接上传原图
                        this.uploadAvatar(tempFilePath)
                    }
                })
            }
        })
    },

    // 压缩图片
    compressImage: function (src, imageInfo) {
        wx.showLoading({
            title: '处理图片中...'
        })

        // 创建离屏canvas
        const ctx = wx.createCanvasContext('avatarCanvas')

        // 计算压缩后的尺寸，保持宽高比
        let targetWidth = 300
        let targetHeight = 300

        // 保持原图比例
        const ratio = imageInfo.width / imageInfo.height
        if (ratio > 1) {
            // 宽图
            targetHeight = targetWidth / ratio
        } else {
            // 高图
            targetWidth = targetHeight * ratio
        }

        // 在canvas上绘制图片
        ctx.drawImage(src, 0, 0, targetWidth, targetHeight)
        ctx.draw(false, () => {
            // 将canvas转为图片
            wx.canvasToTempFilePath({
                canvasId: 'avatarCanvas',
                x: 0,
                y: 0,
                width: targetWidth,
                height: targetHeight,
                quality: 0.8,
                success: res => {
                    console.log('图片压缩成功:', res.tempFilePath)
                    wx.hideLoading()
                    // 上传压缩后的图片
                    this.uploadAvatar(res.tempFilePath)
                },
                fail: err => {
                    console.error('图片压缩失败:', err)
                    wx.hideLoading()
                    // 压缩失败，使用原图
                    this.uploadAvatar(src)
                }
            })
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

                // 头像上传成功后自动保存用户信息
                this.autoSaveUserInfo(res.fileID)
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

    // 自动保存用户信息（头像更新后）
    autoSaveUserInfo: function (newAvatarUrl) {
        const openid = app.globalData.openid
        const nickname = this.data.nickname

        console.log('自动保存用户信息:', {
            nickname: nickname,
            avatarUrl: newAvatarUrl,
            openid: openid
        })

        // 使用云函数更新用户信息
        wx.cloud.callFunction({
            name: 'fixUserInfo',
            data: {
                userInfo: {
                    nickname: nickname,
                    avatarUrl: newAvatarUrl
                }
            },
            success: res => {
                console.log('自动保存用户信息成功:', res.result)
                wx.hideLoading()

                if (res.result.success) {
                    // 更新全局用户信息
                    app.globalData.userInfo = res.result.userInfo
                    app.globalData.isLogin = true

                    // 更新本地存储
                    wx.setStorageSync('userInfo', res.result.userInfo)

                    wx.showToast({
                        title: '头像已更新',
                        icon: 'success'
                    })
                } else {
                    wx.showToast({
                        title: '头像已上传，但保存信息失败',
                        icon: 'none'
                    })
                }
            },
            fail: err => {
                console.error('自动保存用户信息失败:', err)
                wx.hideLoading()

                // 显示头像已上传但保存失败的提示
                wx.showToast({
                    title: '头像已上传，但保存信息失败',
                    icon: 'none'
                })

                // 备用方案：使用数据库API更新
                this.autoSaveUserInfoWithDB(newAvatarUrl)
            }
        })
    },

    // 备用方案：使用数据库API自动保存用户信息
    autoSaveUserInfoWithDB: function (newAvatarUrl) {
        const db = wx.cloud.database()
        const openid = app.globalData.openid
        const nickname = this.data.nickname

        // 使用update方法更新用户信息
        db.collection('users').doc(openid).update({
            data: {
                nickname: nickname,
                avatarUrl: newAvatarUrl,
                updateTime: db.serverDate()
            }
        }).then(() => {
            console.log('自动保存用户信息成功（数据库API）')

            // 更新全局用户信息
            const updatedUserInfo = {
                _id: openid,
                nickname: nickname,
                avatarUrl: newAvatarUrl,
                updateTime: new Date()
            };

            // 保留原有的其他字段
            if (app.globalData.userInfo) {
                if (app.globalData.userInfo.createTime) {
                    updatedUserInfo.createTime = app.globalData.userInfo.createTime;
                }
            }

            app.globalData.userInfo = updatedUserInfo;

            // 确保本地存储也更新
            wx.setStorageSync('userInfo', app.globalData.userInfo)

            wx.showToast({
                title: '头像已更新',
                icon: 'success'
            })
        }).catch(err => {
            console.error('自动保存用户信息失败（数据库API）', err)
            wx.showToast({
                title: '头像已上传，但保存信息失败',
                icon: 'none'
            })
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

        const openid = app.globalData.openid

        console.log('准备保存用户信息:', {
            nickname: this.data.nickname,
            avatarUrl: this.data.avatarUrl,
            openid: openid
        })

        // 使用云函数更新用户信息
        wx.cloud.callFunction({
            name: 'fixUserInfo',
            data: {
                userInfo: {
                    nickname: this.data.nickname,
                    avatarUrl: this.data.avatarUrl
                }
            },
            success: res => {
                console.log('云函数更新用户信息成功:', res.result)

                if (res.result.success) {
                    // 更新全局用户信息
                    app.globalData.userInfo = res.result.userInfo
                    app.globalData.isLogin = true

                    // 更新本地存储
                    wx.setStorageSync('userInfo', res.result.userInfo)

                    wx.hideLoading()
                    wx.showToast({
                        title: '保存成功',
                        success: () => {
                            setTimeout(() => {
                                wx.navigateBack()
                            }, 1000)
                        }
                    })
                } else {
                    console.error('云函数更新用户信息失败:', res.result)
                    wx.hideLoading()
                    wx.showToast({
                        title: '保存失败',
                        icon: 'none'
                    })
                    this.setData({ isLoading: false })
                }
            },
            fail: err => {
                console.error('调用云函数失败:', err)

                // 备用方案：使用数据库API更新
                this.updateUserInfoWithDB()
            }
        })
    },

    // 备用方案：使用数据库API更新用户信息
    updateUserInfoWithDB: function () {
        const db = wx.cloud.database()
        const openid = app.globalData.openid

        // 使用update方法更新用户信息
        db.collection('users').doc(openid).update({
            data: {
                nickname: this.data.nickname,
                avatarUrl: this.data.avatarUrl,
                updateTime: db.serverDate()
            }
        }).then(() => {
            console.log('保存用户信息成功')

            // 更新全局用户信息
            const updatedUserInfo = {
                _id: openid,
                nickname: this.data.nickname,
                avatarUrl: this.data.avatarUrl,
                updateTime: new Date()
            };

            // 保留原有的其他字段
            if (app.globalData.userInfo) {
                if (app.globalData.userInfo.createTime) {
                    updatedUserInfo.createTime = app.globalData.userInfo.createTime;
                }
            }

            app.globalData.userInfo = updatedUserInfo;

            // 确保本地存储也更新
            wx.setStorageSync('userInfo', app.globalData.userInfo)

            wx.hideLoading()
            wx.showToast({
                title: '保存成功',
                success: () => {
                    setTimeout(() => {
                        wx.navigateBack()
                    }, 1000)
                }
            })
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