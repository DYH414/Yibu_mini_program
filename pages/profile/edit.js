const app = getApp();
const db = wx.cloud.database();

Page({
    data: {
        userInfo: {},
        nickname: '',
        avatarUrl: '',
        isLoading: false
    },

    onLoad: function (options) {
        // 获取用户信息
        const userInfo = app.globalData.userInfo;
        if (userInfo) {
            this.setData({
                userInfo: userInfo,
                nickname: userInfo.nickname || '',
                avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png'
            });
        } else {
            wx.showToast({
                title: '请先登录',
                icon: 'none',
                success: () => {
                    setTimeout(() => {
                        wx.navigateBack();
                    }, 1500);
                }
            });
        }
    },

    // 输入昵称
    onNicknameInput: function (e) {
        this.setData({
            nickname: e.detail.value
        });
    },

    // 选择头像
    chooseAvatar: function () {
        wx.chooseImage({
            count: 1,
            sizeType: ['compressed'],
            sourceType: ['album', 'camera'],
            success: (res) => {
                const tempFilePath = res.tempFilePaths[0];
                this.setData({
                    avatarUrl: tempFilePath
                });
            }
        });
    },

    // 保存资料
    saveProfile: function () {
        const { nickname, avatarUrl, userInfo } = this.data;

        if (!nickname.trim()) {
            wx.showToast({
                title: '昵称不能为空',
                icon: 'none'
            });
            return;
        }

        this.setData({ isLoading: true });

        // 如果头像没有变化，直接更新昵称
        if (avatarUrl === userInfo.avatarUrl) {
            this.updateUserInfo({
                nickname: nickname,
                avatarUrl: avatarUrl
            });
            return;
        }

        // 如果头像变化了，先上传头像
        const cloudPath = `avatars/${userInfo.openid}_${Date.now()}.jpg`;

        wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: avatarUrl,
            success: res => {
                // 上传成功，获取文件ID
                const fileID = res.fileID;
                // 更新用户信息
                this.updateUserInfo({
                    nickname: nickname,
                    avatarUrl: fileID
                });
            },
            fail: err => {
                console.error('上传头像失败', err);
                this.setData({ isLoading: false });
                wx.showToast({
                    title: '头像上传失败',
                    icon: 'none'
                });
            }
        });
    },

    // 更新用户信息
    updateUserInfo: function (data) {
        const userInfo = this.data.userInfo;

        db.collection('users').doc(userInfo.openid).update({
            data: data
        }).then(() => {
            // 更新全局用户信息
            app.globalData.userInfo = {
                ...userInfo,
                ...data
            };

            this.setData({ isLoading: false });

            wx.showToast({
                title: '保存成功',
                icon: 'success',
                success: () => {
                    setTimeout(() => {
                        wx.navigateBack();
                    }, 1500);
                }
            });
        }).catch(err => {
            console.error('更新用户信息失败', err);
            this.setData({ isLoading: false });
            wx.showToast({
                title: '保存失败',
                icon: 'none'
            });
        });
    },

    // 返回上一页
    goBack: function () {
        wx.navigateBack();
    }
}); 