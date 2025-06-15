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
        console.log('编辑页面加载，用户信息:', userInfo);

        if (userInfo && userInfo._id) {
            this.setData({
                userInfo: userInfo,
                nickname: userInfo.nickname || '',
                avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png'
            });
            console.log('设置页面数据成功，用户ID:', userInfo._id);
        } else {
            console.error('用户未登录或用户信息不完整');
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
        // 获取用户ID，应该使用_id作为文档ID
        const userId = userInfo._id;

        if (!userId) {
            console.error('无法获取用户ID');
            this.setData({ isLoading: false });
            wx.showToast({
                title: '保存失败，请重新登录',
                icon: 'none'
            });
            return;
        }

        const cloudPath = `avatars/${userId}_${Date.now()}.jpg`;
        console.log('上传头像，路径:', cloudPath);

        wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: avatarUrl,
            success: res => {
                // 上传成功，获取文件ID
                const fileID = res.fileID;
                console.log('头像上传成功，fileID:', fileID);

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
        // 获取用户ID，应该使用_id作为文档ID
        const userId = userInfo._id;

        if (!userId) {
            console.error('无法获取用户ID');
            this.setData({ isLoading: false });
            wx.showToast({
                title: '保存失败，请重新登录',
                icon: 'none'
            });
            return;
        }

        console.log('更新用户信息，用户ID:', userId);

        db.collection('users').doc(userId).update({
            data: data
        }).then(() => {
            // 更新全局用户信息
            app.globalData.userInfo = {
                ...userInfo,
                ...data
            };

            // 更新本地存储
            wx.setStorageSync('userInfo', app.globalData.userInfo);

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