import os
import re

def translate_chinese_to_english(text):
    """
    将特定的中文关键词翻译成英文
    """
    translation_dict = {
        '类型': 'Type',
        '状态': 'State',
        '按下': 'Pressed',
        '选中': 'Selected',
        '键盘': 'Keyboard',
        '鼠标': 'Mouse',
        '虚拟存储': 'VirtualStorage',
        '禁用': 'Disabled',
        '连接统计': 'ConnectStats',
        '共享文件夹': 'SharedFolders',
        '视频': 'Video',
        'MTP': 'MTP',
        'UAC': 'UAC'
    }
    
    for chinese, english in translation_dict.items():
        text = text.replace(chinese, english)
    
    return text

def clean_filename(filename):
    """
    清理文件名：翻译中文关键词，移除空格、等号、逗号，并去除Type和State文字
    """
    # 分离文件名和扩展名[1,5](@ref)
    name, ext = os.path.splitext(filename)
    
    # 1. 翻译中文关键词
    translated_name = translate_chinese_to_english(name)
    
    # 2. 使用正则表达式移除所有空格、等号、逗号[7](@ref)
    cleaned_name = re.sub(r'[\s=,]+', '', translated_name)
    
    # 3. 去除Type和State文字（新增功能）
    cleaned_name = cleaned_name.replace('Type', '').replace('State', '')
    
    return cleaned_name + ext

def rename_files(directory_path='.'):
    """
    重命名指定目录下的所有文件[4,6](@ref)
    """
    print(f"正在处理目录: {os.path.abspath(directory_path)}")
    
    try:
        files = [f for f in os.listdir(directory_path) if os.path.isfile(os.path.join(directory_path, f))]
    except FileNotFoundError:
        print(f"错误：目录 '{directory_path}' 不存在。")
        return
    except PermissionError:
        print(f"错误：没有权限访问目录 '{directory_path}'。")
        return

    if not files:
        print("指定目录中没有文件。")
        return

    renamed_count = 0
    print("\n开始重命名...")

    for filename in files:
        old_name = filename
        new_name = clean_filename(old_name)
        
        # 只有当文件名确实发生变化时才进行重命名
        if old_name != new_name:
            old_path = os.path.join(directory_path, old_name)
            new_path = os.path.join(directory_path, new_name)
            
            # 检查新文件名是否已存在，避免覆盖
            if os.path.exists(new_path):
                print(f"警告：目标文件已存在，跳过 {old_name} -> {new_name}")
                continue
                
            try:
                os.rename(old_path, new_path)
                print(f"✓ 重命名: {old_name} -> {new_name}")
                renamed_count += 1
            except OSError as e:
                print(f"✗ 重命名失败 {old_name}: {e}")

    print(f"\n完成！成功重命名了 {renamed_count} 个文件。")

def preview_renames(directory_path='.'):
    """
    预览重命名效果，而不实际执行重命名操作[4](@ref)
    """
    print("=== 预览重命名效果（非实际执行）===")
    print(f"预览目录: {os.path.abspath(directory_path)}")
    print("-" * 60)
    
    try:
        files = [f for f in os.listdir(directory_path) if os.path.isfile(os.path.join(directory_path, f))]
    except Exception as e:
        print(f"无法读取目录: {e}")
        return

    if not files:
        print("目录中没有文件可预览。")
        return

    change_count = 0
    for filename in files:
        new_filename = clean_filename(filename)
        if filename != new_filename:
            print(f"原文件名: {filename}")
            print(f"新文件名: {new_filename}")
            print("-" * 40)
            change_count += 1

    if change_count == 0:
        print("未发现需要重命名的文件（所有文件名已符合规则）。")
    else:
        print(f"预览结束。共有 {change_count} 个文件将被重命名。")

# 使用示例
if __name__ == "__main__":
    # 1. 先预览重命名效果（推荐）
    print("=== 预览模式 ===")
    preview_renames()  # 处理当前目录
    
    # 2. 测试您提供的示例文件名转换效果
    print("\n=== 示例文件名转换效果 ===")
    example_files = [
        "类型=Connect Stats,状态=按下.svg",
        "类型=Connect Stats,状态=选中.svg",
        "类型=Disabled,状态=按下.svg",
        "类型=MTP,状态=按下.svg",
        "类型=Shared Folders,状态=按下.svg",
        "类型=UAC,状态=按下.svg",
        "类型=UAC,状态=选中.svg",
        "类型=Video,状态=按下.svg",
        "类型=Video,状态=选中.svg",
        "类型=键盘,状态=按下.svg",
        "类型=键盘,状态=选中.svg",
        "类型=鼠标,状态=按下.svg",
        "类型=鼠标,状态=选中.svg",
        "类型=虚拟存储,状态=按下.svg",
        "类型=虚拟存储,状态=选中.svg"
    ]
    
    for old_name in example_files:
        new_name = clean_filename(old_name)
        print(f"{old_name}")
        print(f"-> {new_name}")
        print()
    
    # 3. 实际执行重命名（取消注释以下代码来执行）

    print("\n=== 执行重命名 ===")
    # 确认预览结果无误后，取消下面的注释来执行重命名
    rename_files()  # 重命名当前目录的文件

