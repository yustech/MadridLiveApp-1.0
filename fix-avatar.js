import fs from 'fs';

let content = fs.readFileSync('src/validators.ts', 'utf8');

// Simply replace the avatar section
const oldBlock = `  // avatar (optional, URL, max 512)
  if (b.avatar !== undefined) {
    if (typeof b.avatar === "string") {
      const avatarTrimmed = b.avatar.trim();
      if (avatarTrimmed.length > 512) {
        errors.push({
          field: "avatar",
          message: "Avatar URL exceeds max length of 512 characters",
        });
      } else {
        sanitized.avatar = avatarTrimmed;
      }
    } else if (b.avatar !== null) {
      errors.push({
        field: "avatar",
        message: \`Expected string or null, got \${typeof b.avatar}\`,
      });
    } else {
      sanitized.avatar = null;
    }
  }`;

const newBlock = `  // avatar (optional, URL, max 512, defaults to empty string)
  if (b.avatar !== undefined) {
    if (typeof b.avatar === "string") {
      const avatarTrimmed = b.avatar.trim();
      if (avatarTrimmed.length > 512) {
        errors.push({
          field: "avatar",
          message: "Avatar URL exceeds max length of 512 characters",
        });
      } else {
        sanitized.avatar = avatarTrimmed || "";
      }
    } else if (b.avatar !== null) {
      errors.push({
        field: "avatar",
        message: \`Expected string or null, got \${typeof b.avatar}\`,
      });
    } else {
      sanitized.avatar = "";
    }
  } else {
    sanitized.avatar = "";
  }`;

if (content.includes(oldBlock)) {
  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync('src/validators.ts', content, 'utf8');
  console.log('✓ Fixed avatar default');
} else {
  console.error('✗ Avatar block not found');
  // Just append default handling at end of staff validation
  const staffValidFunc = content.indexOf('return {\n    valid: errors.length === 0,\n    errors,\n    sanitized,\n  };\n}');
  if (staffValidFunc !== -1) {
    // Find the line before return statement in validateStaffPayload
    const beforeReturn = content.lastIndexOf('sanitized.', staffValidFunc);
    const lineEnd = content.indexOf('\n', beforeReturn);
    // Add avatar default after lastSeen = null
    if (content.includes('sanitized.lastSeen = null;')) {
      const pos = content.indexOf('sanitized.lastSeen = null;');
      const after = pos + 'sanitized.lastSeen = null;'.length;
      const before = content.substring(0, after);
      const rest = content.substring(after);
      content = before + '\n  if (!sanitized.avatar) sanitized.avatar = "";' + rest;
      fs.writeFileSync('src/validators.ts', content, 'utf8');
      console.log('✓ Added avatar default fallback');
    }
  }
}
